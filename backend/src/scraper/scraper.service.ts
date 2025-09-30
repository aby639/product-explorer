// backend/src/scraper/scraper.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { chromium, devices } from 'playwright';
import { Product } from '../entities/product.entity';
import { ProductDetail } from '../entities/product-detail.entity';

type PWPage = import('playwright').Page;

/* --------------------------------- helpers -------------------------------- */

function absolutize(base: string, u?: string | null) {
  if (!u) return null;
  try { return new URL(u, base).toString(); } catch { return null; }
}

async function gotoWithRetry(page: PWPage, url: string) {
  let attempt = 0;
  while (attempt < 3) {
    try {
      const resp = await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
      // give the client-side app a moment to hydrate & fetch bits (Render is slower)
      await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
      return resp;
    } catch {
      await page.waitForTimeout(500 * Math.pow(2, attempt));
      attempt++;
    }
  }
  return page.goto(url, { waitUntil: 'load', timeout: 60_000 }).catch(() => null);
}

// tiny HTML entity decoder
function decodeEntities(s: string): string {
  if (!s) return s;
  const named = s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
  return named
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCharCode(code) : _;
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hx) => {
      const code = parseInt(hx, 16);
      return Number.isFinite(code) ? String.fromCharCode(code) : _;
    });
}

/* ------------------------ DOM extraction (Playwright) ------------------------ */

async function waitForPriceOrUnavailable(page: PWPage) {
  // Wait up to ~6s for either a price token or the “Currently Unavailable” ribbon
  await page.waitForFunction(() => {
    const scope = document.querySelector('main') || document.body;
    const txt = (scope?.textContent || '').toLowerCase();
    if (txt.includes('currently unavailable') || txt.includes('out of stock')) return true;
    // quick scan for currency tokens
    return /£\s?\d|€\s?\d|\$\s?\d|\bGBP\b|\bEUR\b|\bUSD\b/.test(scope?.textContent || '');
  }, { timeout: 6_000 }).catch(() => {});
}

async function extractDescription(page: PWPage): Promise<string | null> {
  const raw =
    (await page
      .$$eval(
        [
          'section:has(h2:has-text("Summary")) p',
          'section:has(h3:has-text("Summary")) p',
          '#description p, #description div',
          '.ProductDescription p, .product-description p',
          '[data-testid="product-description"] p, [data-testid="product-description"] div',
        ].join(','),
        nodes => nodes.map(n => (n.textContent || '').trim()).filter(Boolean).join('\n').trim(),
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
    '';

  const cleaned = decodeEntities(raw).replace(/\s+\n/g, '\n').trim();
  return cleaned.length ? cleaned : null;
}

async function extractImage(page: PWPage, baseUrl: string): Promise<string | null> {
  const raw =
    (await page
      .evaluate(() => {
        const absolutize = (u: string) => { try { return new URL(u, location.href).toString(); } catch { return null; } };
        const isLogo = (u: string, alt = '') =>
          !u || /\.svg(\?|$)/i.test(u) ||
          /(logo|sprite|icon|favicon|trustpilot|placeholder|opengraph\-default|og\-image\-default)/i.test(u) ||
          /(logo|trustpilot|icon|placeholder)/i.test(alt);

        // 0) explicit product-area images first (common on WOB)
        const specific = document.querySelector<HTMLImageElement>(
          'main img[class*="product"], main figure img, [data-testid*="image"] img, picture img'
        );
        if (specific?.src && !isLogo(specific.src, specific.alt || '')) return absolutize(specific.src);

        // 1) OG/Twitter
        const og =
          document
            .querySelector<HTMLMetaElement>('meta[property="og:image"], meta[name="og:image"], meta[name="twitter:image"]')
            ?.content?.trim() || null;
        if (og && !isLogo(og)) return absolutize(og);

        // 2) JSON-LD Product/Book
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

        // 3) Biggest portrait-ish IMG within main
        const root = document.querySelector('main') || document.body;
        const imgs = Array.from(root.querySelectorAll<HTMLImageElement>('img'));
        const candidates = imgs
          .map(img => {
            const srcset = img.getAttribute('srcset');
            const srcFromSet = srcset?.split(',')?.map(s => s.trim().split(' ')[0])?.filter(Boolean)?.pop() || null;
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

/**
 * Price extractor:
 *  - JSON-LD `offers` (min price) if present.
 *  - Else scan visible controls/labels/basket areas and pick **lowest** currency value.
 *  - Also return `unavailable` flag when the page says so.
 */
async function extractPriceAndCurrency(
  page: PWPage,
): Promise<{ price: number | null; currency: string | null; unavailable: boolean }> {
  const unavailable = await page
    .evaluate(() => {
      const scope = document.querySelector('main') || document.body;
      const txt = (scope?.textContent || '').toLowerCase();
      return txt.includes('currently unavailable') || txt.includes('out of stock');
    })
    .catch(() => false);

  // JSON-LD first
  const fromLd = await page
    .evaluate(() => {
      const out = { price: null as number | null, currency: null as string | null };
      try {
        const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]'));
        let best: number | null = null;
        let cur: string | null = null;

        const touchOffer = (o: any) => {
          const raw = o?.lowPrice ?? o?.price ?? o?.priceSpecification?.price;
          const p = typeof raw === 'string' ? Number(raw) : typeof raw === 'number' ? raw : null;
          const c = o?.priceCurrency ?? o?.priceSpecification?.priceCurrency ?? null;
          if (p != null && p > 0 && p < 1000 && (best == null || p < best)) { best = p; cur = (c || cur); }
        };

        for (const s of scripts) {
          const data = JSON.parse(s.textContent || 'null');
          const list = Array.isArray(data) ? data : [data];
          for (const item of list) {
            const t = item?.['@type'];
            const types = Array.isArray(t) ? t : t ? [t] : [];
            if (!types.some((x: string) => /product|book/i.test(x))) continue;
            const offers = Array.isArray(item.offers) ? item.offers : item.offers ? [item.offers] : [];
            for (const o of offers) touchOffer(o);
          }
        }
        out.price = best;
        out.currency = cur;
      } catch {}
      return out;
    })
    .catch(() => ({ price: null, currency: null }));

  if (fromLd.price != null) {
    return { price: fromLd.price, currency: fromLd.currency ?? null, unavailable };
  }

  // DOM text scanning → min price
  const fromDom = await page
    .evaluate(() => {
      const scope = document.querySelector('main') || document.body;

      const buckets: string[] = [];
      const grab = (el: Element | null | undefined) =>
        (el?.textContent || '').replace(/\s+/g, ' ').trim();

      // condition radios/options/buttons + pricey classes
      scope.querySelectorAll(
        '[role="radio"], [role="option"], button, label, [data-testid*="condition"], [class*="price"], [data-qa*="condition"]'
      ).forEach(el => {
        const t = grab(el);
        if (t) buckets.push(t);
      });

      // near “Select Condition”
      const label = Array.from(scope.querySelectorAll('*')).find(n =>
        /select\s*condition/i.test(n.textContent || ''),
      );
      if (label) {
        const near = grab(label.closest('section') || label.parentElement || undefined);
        if (near) buckets.push(near);
      }

      // near Basket
      const basket = Array.from(scope.querySelectorAll('button, a')).find(n =>
        /add\s*to\s*basket/i.test(n.textContent || ''),
      );
      if (basket) {
        const near = grab(basket.closest('section') || basket.parentElement || undefined);
        if (near) buckets.push(near);
      }

      // fallback to whole scope
      if (!buckets.length) buckets.push(grab(scope));

      const CUR = [
        { rx: /£\s?(\d+(?:\.\d{1,2})?)/g, code: 'GBP' as const },
        { rx: /\bGBP\b\s?(\d+(?:\.\d{1,2})?)/g, code: 'GBP' as const },
        { rx: /€\s?(\d+(?:\.\d{1,2})?)/g, code: 'EUR' as const },
        { rx: /\bEUR\b\s?(\d+(?:\.\d{1,2})?)/g, code: 'EUR' as const },
        { rx: /\$\s?(\d+(?:\.\d{1,2})?)/g, code: 'USD' as const },
        { rx: /\bUSD\b\s?(\d+(?:\.\d{1,2})?)/g, code: 'USD' as const },
      ];

      const found: Array<{ v: number; c: string }> = [];
      for (const s of buckets) {
        for (const { rx, code } of CUR) {
          rx.lastIndex = 0;
          let m: RegExpExecArray | null;
          while ((m = rx.exec(s))) {
            const n = Number(m[1]);
            if (isFinite(n) && n > 0 && n < 1000) found.push({ v: n, c: code });
          }
        }
      }

      if (!found.length) return { price: null, currency: null as string | null };
      found.sort((a, b) => a.v - b.v);
      return { price: found[0].v, currency: found[0].c as string | null };
    })
    .catch(() => ({ price: null, currency: null }));

  return { price: fromDom.price, currency: fromDom.currency, unavailable };
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
    let unavailable = false;

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

      // Wait for price/unavailable token so we don't read too early
      await waitForPriceOrUnavailable(page);

      // ---- extract fields ----
      description = await extractDescription(page);
      imageAbs = await extractImage(page, product.sourceUrl);

      const { price, currency, unavailable: unavail } = await extractPriceAndCurrency(page);
      priceNum = price;
      currencyDetected = currency;
      unavailable = unavail;

      // Rating (best effort)
      const ratingText =
        (await page.locator('[itemprop="ratingValue"]').first().textContent().catch(() => null)) ??
        (await page.locator('.rating__value').first().textContent().catch(() => null)) ??
        null;
      ratingAverage = ratingText ? Number(String(ratingText).replace(/[^\d.]/g, '')) : null;
    } finally {
      await browser.close().catch(() => undefined);
    }

    // ---- persist & log ----
    this.log.log(
      `Found: status=${status} img=${!!imageAbs} descLen=${(description || '').length} price=${
        priceNum ?? 'na'
      } currency=${currencyDetected ?? 'na'} unavailable=${unavailable} rating=${ratingAverage ?? 'na'}`,
    );

    let changedProduct = false;

    if (imageAbs && product.image !== imageAbs) {
      product.image = imageAbs;
      changedProduct = true;
    }

    if (!unavailable) {
      if (Number.isFinite(priceNum as number) && (priceNum as number) > 0 && (priceNum as number) < 1000) {
        if (product.price !== priceNum) {
          product.price = priceNum!;
          changedProduct = true;
        }
      }
    } else {
      // if unavailable, do not clobber a previous known price
      this.log.warn(`Page marked unavailable; keeping existing price=${product.price ?? 'null'}`);
      if (product.price == null) product.price = null;
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

    detail.description = description ? decodeEntities(description) : null;
    detail.ratingAverage = Number.isFinite(ratingAverage as number) ? (ratingAverage as number) : null;
    detail.specs = { ...(detail.specs || {}), lastStatus: status, unavailable };
    detail.lastScrapedAt = new Date();

    await this.details.save(detail);
    this.log.log(`Saved detail for ${product.id}`);
    return detail;
  }
}
