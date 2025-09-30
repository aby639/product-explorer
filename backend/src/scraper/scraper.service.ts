// backend/src/scraper/scraper.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { chromium, devices } from 'playwright';

import { Product } from '../entities/product.entity';
import { ProductDetail } from '../entities/product-detail.entity';

async function gotoWithRetry(page: import('playwright').Page, url: string) {
  let attempt = 0;
  while (attempt < 3) {
    try {
      const resp = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 90_000,
      });
      if (resp?.status() === 429 && attempt < 2) {
        await page.waitForTimeout(600 * Math.pow(2, attempt));
        attempt++;
        continue;
      }
      return resp;
    } catch {
      await page.waitForTimeout(600 * Math.pow(2, attempt));
      attempt++;
    }
  }
  return page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 }).catch(() => null);
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

    // Required in most PaaS containers
    const launchArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--single-process',
      '--no-zygote',
    ];

    let browser: import('playwright').Browser | null = null;

    try {
      browser = await chromium.launch({ headless: true, args: launchArgs });

      const { userAgent: _ua, ...desktopChrome } = devices['Desktop Chrome'];
      const context = await browser.newContext({
        ...desktopChrome,
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      });
      const page = await context.newPage();

      // polite jitter
      await page.waitForTimeout(150 + Math.floor(Math.random() * 250));

      const resp = await gotoWithRetry(page, product.sourceUrl);
      if (resp && resp.status() >= 400 && resp.status() !== 429) {
        this.log.warn(`Non-OK response ${resp.status()} for ${product.sourceUrl}`);
      }

      // --- Handle cookie banners / overlays (WOB uses OneTrust) ---
      try {
        const cookieBtn = page.locator(
          '#onetrust-accept-btn-handler, button#onetrust-accept-btn-handler, button:has-text("Accept all"), button:has-text("Accept All")',
        );
        if (await cookieBtn.first().isVisible({ timeout: 2000 }).catch(() => false)) {
          await cookieBtn.first().click({ timeout: 2000 }).catch(() => undefined);
          await page.waitForTimeout(250);
        }
      } catch { /* ignore */ }

      // Ensure some content is there
      await page.waitForSelector('main, body', { timeout: 12_000 }).catch(() => undefined);
      await page.waitForTimeout(350);

      // ======================
      // DESCRIPTION (robust)
      // ======================
      const description =
        // common WOB containers and generic fallbacks
        (await page
          .$$eval(
            [
              // Typical “Summary” blocks
              'section:has(h2:has-text("Summary")) p',
              'section:has(h3:has-text("Summary")) p',
              // WOB specific blocks
              '[itemprop="description"] p, [itemprop="description"] div',
              '#description p, #description div',
              '.product-description p, .ProductDescription p',
              '[data-testid="product-description"] p, [data-testid="product-description"] div',
              // Generic paragraphs in main (last resort)
              'main p',
            ].join(','),
            (nodes) =>
              nodes
                .map((n) => (n.textContent || '').replace(/\s+/g, ' ').trim())
                .filter(Boolean)
                .join('\n')
                .trim()
                .slice(0, 1500),
          )
          .catch(() => '')) ||
        (await page
          .evaluate(() => {
            // meta description as the final fallback
            const meta =
              document.querySelector<HTMLMetaElement>('meta[name="description"]') ||
              document.querySelector<HTMLMetaElement>('meta[property="og:description"]');
            const m = (meta?.content || '').trim();
            return m.length ? m.slice(0, 1500) : '';
          })
          .catch(() => '')) ||
        '';

      // ======================
      // RATING (best-effort)
      // ======================
      const ratingText =
        (await page.locator('[itemprop="ratingValue"]').first().textContent().catch(() => null)) ??
        (await page.locator('.rating__value').first().textContent().catch(() => null)) ??
        null;
      const ratingAverage = ratingText ? Number(String(ratingText).replace(/[^\d.]/g, '')) : null;

      // ======================
      // IMAGE (stubborn)
      // ======================
      const rawImg = await page
        .evaluate((titleForBoost) => {
          const absolutize = (u: string) => {
            try {
              return new URL(u, location.href).toString();
            } catch {
              return null;
            }
          };

          const isProbablyLogo = (u: string, alt = '') =>
            !u ||
            /\.svg(\?|$)/i.test(u) ||
            /(logo|sprite|icon|favicon|trustpilot|placeholder|opengraph\-default|og\-image\-default)/i.test(u) ||
            /(logo|trustpilot|icon|placeholder)/i.test(alt);

          // 0) Secure OG first (many sites use this)
          const ogSecure =
            document
              .querySelector<HTMLMetaElement>('meta[property="og:image:secure_url"]')
              ?.content?.trim() || null;
          if (ogSecure && !isProbablyLogo(ogSecure)) {
            const abs = absolutize(ogSecure);
            if (abs && !isProbablyLogo(abs)) return abs;
          }

          // 1) OG/Twitter
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

          // 2) JSON-LD Product/Book
          const ldList = Array.from(
            document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]'),
          );
          for (const s of ldList) {
            try {
              const blob = s.textContent || '{}';
              const json = JSON.parse(blob);
              const entries = Array.isArray(json) ? json : [json];
              for (const j of entries) {
                const types = Array.isArray(j['@type']) ? j['@type'] : [j['@type']];
                if (types?.some((t: string) => /product|book/i.test(t))) {
                  const cand = (Array.isArray(j.image) ? j.image[0] : j.image) || j?.offers?.image || null;
                  if (cand && !isProbablyLogo(cand)) {
                    const abs = absolutize(cand);
                    if (abs && !isProbablyLogo(abs)) return abs;
                  }
                }
              }
            } catch {
              /* ignore bad JSON-LD */
            }
          }

          // 3) DOM candidates in <main>
          const root = document.querySelector('main') || document.body;
          const imgs = Array.from(root.querySelectorAll<HTMLImageElement>('img'));
          const candidates = imgs
            .map((img) => {
              const srcset = img.getAttribute('srcset');
              const srcFromSet =
                srcset
                  ?.split(',')
                  ?.map((s) => s.trim().split(' ')[0])
                  ?.filter(Boolean)
                  ?.pop() || null;

              const src = img.getAttribute('src') || img.getAttribute('data-src') || srcFromSet || img.currentSrc || '';
              const alt = (img.getAttribute('alt') || '').toLowerCase();
              const r = img.getBoundingClientRect();
              const area = r.width * r.height;
              const ratio = r.height / Math.max(1, r.width);
              return { src, alt, area, ratio, w: r.width, h: r.height };
            })
            .filter((c) => c.src && !isProbablyLogo(c.src, c.alt))
            .filter((c) => c.w >= 160 && c.h >= 160); // discard tiny assets

          const title = (titleForBoost || '').toLowerCase();
          const score = (c: (typeof candidates)[number]) => {
            const portraitBoost = c.ratio >= 1.15 ? 2 : 1; // book-cover shape
            const titleBoost = title && (c.alt.includes('cover') || c.alt.includes(title)) ? 1.5 : 1;
            return c.area * portraitBoost * titleBoost;
          };

          candidates.sort((a, b) => score(b) - score(a));
          const best = candidates[0]?.src || null;
          return best ? absolutize(best) : null;
        }, product.title)
        .catch(() => null);

      const imageAbs = rawImg && product.sourceUrl ? new URL(rawImg, product.sourceUrl).toString() : null;

      // ======================
      // PRICE (fresh if present)
      // ======================
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

      // ======================
      // Persist
      // ======================
      let changedProduct = false;
      if (imageAbs && product.image !== imageAbs) {
        product.image = imageAbs;
        changedProduct = true;
      }
      if (Number.isFinite(priceNum as number) && (priceNum as number) > 0 && product.price !== priceNum) {
        product.price = priceNum!;
        changedProduct = true;
      }
      if (currencyDetected && product.currency !== currencyDetected) {
        product.currency = currencyDetected;
        changedProduct = true;
      }
      if (changedProduct) {
        await this.products.save(product);
        this.log.log(`Updated product basics (image/price/currency) for ${product.id}`);
      }

      let detail = await this.details.findOne({
        where: { product: { id: product.id } },
        relations: { product: true },
      });
      if (!detail) detail = this.details.create({ product });

      detail.description = description || null;
      detail.ratingAverage = Number.isFinite(ratingAverage as number) ? (ratingAverage as number) : null;
      detail.specs = { ...(detail.specs || {}), source: 'wob', updatedAt: new Date().toISOString() };
      detail.lastScrapedAt = new Date();

      await this.details.save(detail);
      this.log.log(`Saved detail for ${product.id}`);
      return detail;
    } finally {
      try {
        await browser?.close();
      } catch { /* ignore */ }
    }
  }
}
