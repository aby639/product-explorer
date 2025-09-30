// backend/src/scraper/scraper.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { chromium, devices, Browser, Page } from 'playwright';

import { Product } from '../entities/product.entity';
import { ProductDetail } from '../entities/product-detail.entity';

async function gotoWithRetry(page: Page, url: string) {
  let attempt = 0;
  while (attempt < 3) {
    try {
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      if (resp && [429, 403, 503].includes(resp.status()) && attempt < 2) {
        await page.waitForTimeout(700 * Math.pow(2, attempt));
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

    const browserArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--single-process',
      '--no-zygote'
    ];

    let browser: Browser | null = null;
    try {
      browser = await chromium.launch({ headless: true, args: browserArgs });

      // Realistic UK desktop profile
      const { userAgent: _ignored, ...desktopChrome } = devices['Desktop Chrome'];
      const context = await browser.newContext({
        ...desktopChrome,
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        locale: 'en-GB',
        timezoneId: 'Europe/London',
        extraHTTPHeaders: {
          'Accept-Language': 'en-GB,en;q=0.9',
          'Sec-CH-UA-Platform': '"Windows"',
        },
      });

      const page = await context.newPage();
      await page.waitForTimeout(150 + Math.floor(Math.random() * 250));

      const resp = await gotoWithRetry(page, product.sourceUrl);
      if (resp && resp.status() >= 400 && ![429].includes(resp.status())) {
        this.log.warn(`Non-OK response ${resp.status()} for ${product.sourceUrl}`);
      }

      await page.waitForSelector('main, body', { timeout: 12_000 }).catch(() => undefined);
      await page.waitForTimeout(500);

      // ===== DESCRIPTION =====
      const description =
        (await page
          .locator(
            [
              'section:has(h2:has-text("Summary")) p',
              'section:has(h3:has-text("Summary")) p',
              '#description p, #description div',
              '.ProductDescription p, .product-description p',
              '[data-testid="product-description"] p, [data-testid="product-description"] div'
            ].join(','),
          )
          .allTextContents()
          .then((arr) => arr.map((s) => s.trim()).filter(Boolean).join('\n').trim())
          .catch(() => '')) ||
        (await page
          .evaluate(() => {
            const root = (document.querySelector('main') || document.body)!;
            const heading = Array.from(root.querySelectorAll('h1,h2,h3,h4')).find((h) =>
              /summary/i.test(h.textContent || ''),
            );
            if (heading) {
              const section = heading.closest('section') || heading.parentElement;
              if (section) {
                const paras = Array.from(section.querySelectorAll('p,div'));
                const text = paras
                  .map((p) => (p.textContent || '').trim())
                  .filter(Boolean)
                  .join('\n')
                  .trim();
                if (text.length >= 40) return text.slice(0, 1500);
              }
            }
            const meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
            const m = (meta?.content || '').trim();
            return m.length ? m : '';
          })
          .catch(() => '')) ||
        '';

      // ===== RATING =====
      const ratingText =
        (await page.locator('[itemprop="ratingValue"]').first().textContent().catch(() => null)) ??
        (await page.locator('.rating__value').first().textContent().catch(() => null)) ??
        null;
      const ratingAverage = ratingText ? Number(String(ratingText).replace(/[^\d.]/g, '')) : null;

      // ===== IMAGE =====
      const rawImg = await page
        .evaluate((titleForBoost) => {
          const absolutize = (u: string) => {
            try { return new URL(u, location.href).toString(); } catch { return null; }
          };
          const isProbablyLogo = (u: string, alt = '') =>
            !u ||
            /\.svg(\?|$)/i.test(u) ||
            /(logo|sprite|icon|favicon|trustpilot|placeholder|opengraph\-default|og\-image\-default)/i.test(u) ||
            /(logo|trustpilot|icon|placeholder)/i.test(alt);

          // preload hero
          const preload = document.querySelector<HTMLLinkElement>('link[rel="preload"][as="image"]')?.href;
          if (preload && !isProbablyLogo(preload)) {
            const abs = absolutize(preload);
            if (abs && !isProbablyLogo(abs)) return abs;
          }

          // OG/Twitter
          const og =
            document
              .querySelector<HTMLMetaElement>(
                'meta[property="og:image"], meta[name="og:image"], meta[name="twitter:image"]',
              )
              ?.content?.trim() || null;
          if (og && !isProbablyLogo(og)) {
            const abs = absolutize(og);
            if (abs && !isProbablyLogo(abs)) return abs;
          }

          // JSON-LD
          const ldList = Array.from(
            document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]'),
          );
          for (const s of ldList) {
            try {
              const json = JSON.parse(s.textContent || '{}');
              const types = Array.isArray(json['@type']) ? json['@type'] : [json['@type']];
              if (types?.some((t) => /product|book/i.test(t))) {
                const cand = (Array.isArray(json.image) ? json.image[0] : json.image) || json?.offers?.image || null;
                if (cand && !isProbablyLogo(cand)) {
                  const abs = absolutize(cand);
                  if (abs && !isProbablyLogo(abs)) return abs;
                }
              }
            } catch {}
          }

          // DOM candidates
          const root = document.querySelector('main') || document.body;
          const imgs = Array.from(root.querySelectorAll<HTMLImageElement>('img'));
          const candidates = imgs
            .map((img) => {
              const srcset = img.getAttribute('srcset');
              const srcFromSet =
                srcset?.split(',')?.map((s) => s.trim().split(' ')[0])?.filter(Boolean)?.pop() || null;
              const src = img.getAttribute('src') || img.getAttribute('data-src') || srcFromSet || img.currentSrc || '';
              const alt = (img.getAttribute('alt') || '').toLowerCase();
              const r = img.getBoundingClientRect();
              const area = r.width * r.height;
              const ratio = r.height / Math.max(1, r.width);
              return { src, alt, area, ratio, w: r.width, h: r.height };
            })
            .filter((c) => c.src && !isProbablyLogo(c.src, c.alt))
            .filter((c) => c.w >= 160 && c.h >= 220);

          const title = (titleForBoost || '').toLowerCase();
          const score = (c: (typeof candidates)[number]) => {
            const portraitBoost = c.ratio >= 1.2 ? 2 : 1;
            const titleBoost = title && (c.alt.includes('cover') || c.alt.includes(title)) ? 1.5 : 1;
            return c.area * portraitBoost * titleBoost;
          };

          candidates.sort((a, b) => score(b) - score(a));
          const best = candidates[0]?.src || null;
          return best ? absolutize(best) : null;
        }, product.title)
        .catch(() => null);

      const imageAbs = rawImg && product.sourceUrl ? new URL(rawImg, product.sourceUrl).toString() : null;

      // ===== PRICE =====
      const priceText =
        (await page
          .locator(['[data-testid="price"]', '.price', '.ProductPrice', '[itemprop="price"]'].join(','))
          .first()
          .textContent()
          .catch(() => null)) || null;

      const priceNum = priceText ? Number(String(priceText).replace(/[^\d.]/g, '')) : null;
      const currencyDetected =
        priceText && /£|GBP/i.test(priceText)
          ? 'GBP'
          : priceText && /€|EUR/i.test(priceText)
          ? 'EUR'
          : priceText && /\$|USD/i.test(priceText)
          ? 'USD'
          : product.currency ?? null;

      // ===== RECOMMENDATIONS =====
      const recs = await page
        .locator(
          [
            'section:has(h2:has-text("You may also like")) a[href*="/en-gb/products/"]',
            'section:has(h2:has-text("Related")) a[href*="/en-gb/products/"]',
            '.recommended a[href*="/en-gb/products/"]',
            '.related a[href*="/en-gb/products/"]',
          ].join(', '),
        )
        .all()
        .then(async (els) => {
          const out: any[] = [];
          for (const el of els.slice(0, 12)) {
            const href = await el.getAttribute('href');
            const title = (await el.textContent())?.trim() || null;
            if (!href) continue;
            const abs = new URL(href, 'https://www.worldofbooks.com').toString();
            out.push({ href: abs, title });
          }
          return out;
        })
        .catch(() => []);

      // ===== Persist =====
      let changed = false;
      if (imageAbs && product.image !== imageAbs) { product.image = imageAbs; changed = true; }
      if (Number.isFinite(priceNum as number) && (priceNum as number) > 0 && product.price !== priceNum) {
        product.price = priceNum!; changed = true;
      }
      if (currencyDetected && product.currency !== currencyDetected) { product.currency = currencyDetected; changed = true; }
      if (changed) await this.products.save(product);

      let detail = await this.details.findOne({
        where: { product: { id: product.id } },
        relations: { product: true },
      });
      if (!detail) detail = this.details.create({ product });

      detail.description = description || null;
      detail.ratingAverage = Number.isFinite(ratingAverage as number) ? (ratingAverage as number) : null;
      detail.specs = { ...(detail.specs || {}), recommendations: recs };
      detail.lastScrapedAt = new Date();

      await this.details.save(detail);
      this.log.log(`Saved detail for ${product.id}`);
      return detail;
    } finally {
      try { await browser?.close(); } catch {}
    }
  }
}
