// backend/src/scraper/scraper.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { chromium, devices } from 'playwright';

import { Product } from '../entities/product.entity';
import { ProductDetail } from '../entities/product-detail.entity';

type PWPage = import('playwright').Page;

/* ----------------------------- small helpers ----------------------------- */

async function gotoWithRetry(page: PWPage, url: string) {
  let attempt = 0;
  while (attempt < 3) {
    try {
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      if (resp?.status() === 429 && attempt < 2) {
        await page.waitForTimeout(500 * Math.pow(2, attempt));
        attempt++;
        continue;
      }
      return resp;
    } catch {
      await page.waitForTimeout(500 * Math.pow(2, attempt));
      attempt++;
    }
  }
  return page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => null);
}

function absolutize(base: string, u?: string | null) {
  if (!u) return null;
  try { return new URL(u, base).toString(); } catch { return null; }
}

/* ------------------------ DOM extraction (Playwright) ------------------------ */

async function extractDescription(page: PWPage): Promise<string | null> {
  const desc =
    (await page
      .$$eval(
        [
          'section:has(h2:has-text("Summary")) p',
          'section:has(h3:has-text("Summary")) p',
          'section:has(h2:has-text("Summary")) div',
          '#description p, #description div',
          '.ProductDescription p, .product-description p',
          '[data-testid="product-description"] p, [data-testid="product-description"] div',
        ].join(','),
        nodes =>
          nodes.map(n => (n.textContent || '').trim()).filter(Boolean).join('\n').trim(),
      )
      .catch(() => '')) ||
    (await page
      .evaluate(() => {
        const root = (document.querySelector('main') || document.body)!;
        const heading = Array.from(root.querySelectorAll('h1,h2,h3,h4')).find(h =>
          /summary|description/i.test(h.textContent || ''),
        );
        if (heading) {
          const section = heading.closest('section') || heading.parentElement;
          if (section) {
            const text = Array.from(section.querySelectorAll('p,div'))
              .map(p => (p.textContent || '').trim())
              .filter(Boolean)
              .join('\n')
              .trim();
            if (text.length >= 40) return text.slice(0, 1500);
          }
        }
        const meta =
          document.querySelector<HTMLMetaElement>('meta[name="description"]') ||
          document.querySelector<HTMLMetaElement>('meta[property="og:description"]');
        const m = (meta?.content || '').trim();
        return m.length ? m : '';
      })
      .catch(() => '')) ||
    null;

  return desc && desc.length ? desc : null;
}

async function extractImage(page: PWPage, baseUrl: string): Promise<string | null> {
  const raw =
    (await page
      .evaluate(() => {
        const absolutize = (u: string) => {
          try { return new URL(u, location.href).toString(); } catch { return null; }
        };
        const isLogo = (u: string, alt = '') =>
          !u ||
          /\.svg(\?|$)/i.test(u) ||
          /(logo|sprite|icon|favicon|trustpilot|placeholder|opengraph\-default|og\-image\-default)/i.test(u) ||
          /(logo|trustpilot|icon|placeholder)/i.test(alt);

        // Prefer OG/Twitter
        const og =
          document
            .querySelector<HTMLMetaElement>('meta[property="og:image"], meta[name="og:image"], meta[name="twitter:image"]')
            ?.content?.trim() || null;
        if (og && !isLogo(og)) return absolutize(og);

        // JSON-LD for Product/Book
        const ldList = Array.from(document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]'));
        for (const s of ldList) {
          try {
            const json = JSON.parse(s.textContent || '{}');
            const list = Array.isArray(json) ? json : [json];
            for (const item of list) {
              const t = item?.['@type'];
              const types = Array.isArray(t) ? t : t ? [t] : [];
              if (types.some((x: string) => /product|book/i.test(x))) {
                const cand = (Array.isArray(item.image) ? item.image[0] : item.image) || item?.offers?.image || null;
                if (cand && !isLogo(cand)) return absolutize(cand);
              }
            }
          } catch {}
        }

        // Fallback: biggest portrait-ish IMG in main
        const root = document.querySelector('main') || document.body;
        const imgs = Array.from(root.querySelectorAll<HTMLImageElement>('img'));
        const candidates = imgs
          .map(img => {
            const srcset = img.getAttribute('srcset');
            const srcFromSet =
              srcset?.split(',')?.map(s => s.trim().split(' ')[0])?.filter(Boolean)?.pop() || null;
            const src = img.getAttribute('src') || img.getAttribute('data-src') || srcFromSet || img.currentSrc || '';
            const alt = (img.getAttribute('alt') || '').toLowerCase();
            const r = img.getBoundingClientRect();
            const area = r.width * r.height;
            const ratio = r.height / Math.max(1, r.width);
            return { src, alt, area, ratio, w: r.width, h: r.height };
          })
          .filter(c => c.src && !isLogo(c.src, c.alt))
          .filter(c => c.w >= 180 && c.h >= 180);

        const score = (c: any) => c.area * (c.ratio >= 1.2 ? 2 : 1);
        candidates.sort((a, b) => score(b) - score(a));
        const best = candidates[0]?.src || null;
        return best ? absolutize(best) : null;
      })
      .catch(() => null)) || null;

  return absolutize(baseUrl, raw);
}

/** Strict price extractor: scan the main content for visible currency amounts and pick the MIN. */
async function extractPriceAndCurrency(page: PWPage): Promise<{ price: number | null; currency: string | null }> {
  return await page
    .evaluate(() => {
      // scope to main content to avoid header/footer promos
      const root = (document.querySelector('main') || document.body).cloneNode(true) as HTMLElement;

      // Hide script/style/noscript
      root.querySelectorAll('script,style,noscript').forEach(n => n.remove());

      // Only consider visible text nodes
      const getText = (el: Element) => {
        const style = (el as HTMLElement).style;
        if (!el || (style && (style.display === 'none' || style.visibility === 'hidden'))) return '';
        return (el.textContent || '').replace(/\s+/g, ' ').trim();
      };

      const texts: string[] = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
      // Collect texts from likely price containers first
      const likely = Array.from(root.querySelectorAll('[data-testid*="price"], .price, [itemprop="price"], button, label, span, div'));
      likely.forEach(el => {
        const t = getText(el);
        if (t) texts.push(t);
      });
      // Fallback: everything
      if (!texts.length) {
        const all = Array.from(root.querySelectorAll('*'));
        all.forEach(el => {
          const t = getText(el);
          if (t) texts.push(t);
        });
      }

      const CURRENCIES = [
        { rx: /£\s?(\d+(?:\.\d{1,2})?)/g, code: 'GBP' },
        { rx: /\bGBP\b\s?(\d+(?:\.\d{1,2})?)/g, code: 'GBP' },
        { rx: /€\s?(\d+(?:\.\d{1,2})?)/g, code: 'EUR' },
        { rx: /\bEUR\b\s?(\d+(?:\.\d{1,2})?)/g, code: 'EUR' },
        { rx: /\$\s?(\d+(?:\.\d{1,2})?)/g, code: 'USD' },
        { rx: /\bUSD\b\s?(\d+(?:\.\d{1,2})?)/g, code: 'USD' },
      ];

      const found: Array<{ value: number; code: string }> = [];
      for (const s of texts) {
        for (const { rx, code } of CURRENCIES) {
          let m: RegExpExecArray | null;
          rx.lastIndex = 0;
          while ((m = rx.exec(s))) {
            const num = Number(m[1]);
            if (isFinite(num) && num > 0 && num < 1000) found.push({ value: num, code });
          }
        }
      }

      if (!found.length) return { price: null, currency: null };

      // Choose the *lowest* (WOB shows lowest condition price in the main panel)
      found.sort((a, b) => a.value - b.value);
      const { value, code } = found[0];
      return { price: value, currency: code };
    })
    .catch(() => ({ price: null, currency: null }));
}

/* --------------------------------- service -------------------------------- */

@Injectable()
export class ScraperService {
  private readonly log = new Logger(ScraperService.name);
  private inFlight = new Map<string, Promise<ProductDetail>>();

  constructor(
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(ProductDetail) private readonly details: Repository<ProductDetail>,
  ) {}

  async refreshProduct(productId: string): Promise<ProductDetail> {
    if (this.inFlight.has(productId)) return this.inFlight.get(productId)!;
    const work = this._refreshProduct(productId).finally(() => this.inFlight.delete(productId));
    this.inFlight.set(productId, work);
    return work;
  }

  private async _refreshProduct(productId: string): Promise<ProductDetail> {
    const product = await this.products.findOne({ where: { id: productId } });
    if (!product?.sourceUrl) throw new Error('Product has no sourceUrl');

    this.log.log(`Scraping ${product.sourceUrl}`);

    let description: string | null = null;
    let imageAbs: string | null = null;
    let priceNum: number | null = null;
    let currencyDetected: string | null = null;
    let ratingAverage: number | null = null;
    let status: number | null = null;

    const launchArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--single-process',
      '--no-zygote',
    ];
    const browser = await chromium.launch({ headless: true, args: launchArgs });

    try {
      const { userAgent: _ua, ...desktopChrome } = devices['Desktop Chrome'];
      const context = await browser.newContext({
        ...desktopChrome,
        viewport: { width: 1280, height: 900 },
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        extraHTTPHeaders: {
          'Accept-Language': 'en-GB,en;q=0.9',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        locale: 'en-GB',
      });

      const page = await context.newPage();
      await page.waitForTimeout(120 + Math.floor(Math.random() * 200));
      const resp = await gotoWithRetry(page, product.sourceUrl);
      status = resp?.status?.() ?? null;

      // Cookie banner (best effort)
      await page
        .locator(
          [
            'button:has-text("Accept all")',
            'button:has-text("Accept All")',
            'button:has-text("Accept cookies")',
            '[aria-label="accept cookies"]',
          ].join(','),
        )
        .first()
        .click({ timeout: 3_000 })
        .catch(() => undefined);

      await page.waitForSelector('main, body', { timeout: 10_000 }).catch(() => undefined);
      await page.waitForTimeout(300);

      // Extract fields
      description = await extractDescription(page);
      imageAbs = await extractImage(page, product.sourceUrl);

      // *** Price: strict & scoped ***
      const priceRes = await extractPriceAndCurrency(page);
      priceNum = priceRes.price;
      currencyDetected = priceRes.currency;

      // Rating (best effort)
      const ratingText =
        (await page.locator('[itemprop="ratingValue"]').first().textContent().catch(() => null)) ??
        (await page.locator('.rating__value').first().textContent().catch(() => null)) ??
        null;
      ratingAverage = ratingText ? Number(String(ratingText).replace(/[^\d.]/g, '')) : null;
    } finally {
      await browser.close().catch(() => undefined);
    }

    // Log once
    this.log.log(
      `Found: status=${status} img=${!!imageAbs} descLen=${(description || '').length} price=${
        priceNum ?? 'na'
      } currency=${currencyDetected ?? 'na'} rating=${ratingAverage ?? 'na'}`,
    );

    // Persist changes
    let changedProduct = false;
    if (imageAbs && product.image !== imageAbs) {
      product.image = imageAbs;
      changedProduct = true;
    }
    if (Number.isFinite(priceNum as number) && (priceNum as number) > 0 && (priceNum as number) < 1000) {
      if (product.price !== priceNum) {
        product.price = priceNum!;
        changedProduct = true;
      }
    }
    if (currencyDetected && product.currency !== currencyDetected) {
      product.currency = currencyDetected;
      changedProduct = true;
    }
    if (changedProduct) await this.products.save(product);

    let detail = await this.details.findOne({
      where: { product: { id: product.id } },
      relations: { product: true },
    });
    if (!detail) detail = this.details.create({ product });

    detail.description = description || null;
    detail.ratingAverage = Number.isFinite(ratingAverage as number) ? (ratingAverage as number) : null;
    detail.specs = { ...(detail.specs || {}), lastStatus: status };
    detail.lastScrapedAt = new Date();

    await this.details.save(detail);
    this.log.log(`Saved detail for ${product.id}`);
    return detail;
  }
}
