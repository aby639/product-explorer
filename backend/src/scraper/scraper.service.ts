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
        timeout: 60_000,
      });
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

    // Container-friendly flags
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

      const { userAgent: _ignored, ...desktopChrome } = devices['Desktop Chrome'];

      const context = await browser.newContext({
        ...desktopChrome,
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        locale: 'en-GB',
        timezoneId: 'Europe/London',
        colorScheme: 'dark',
      });

      // Some sites dislike a storm of requests; keep analytics/light assets but block heavy fonts/video
      await context.route('**/*', (route) => {
        const url = route.request().url();
        if (/\.(mp4|webm|avi|mov|mkv|woff2?|ttf|otf)$/i.test(url)) return route.abort();
        return route.continue();
      });

      const page = await context.newPage();

      // Be polite / staggered
      await page.waitForTimeout(150 + Math.floor(Math.random() * 250));

      const resp = await gotoWithRetry(page, product.sourceUrl);
      const status = resp?.status?.() ?? 0;
      this.log.log(`HTTP status ${status} for ${product.sourceUrl}`);

      // Try to close cookie / consent banners (common patterns)
      try {
        const selectors = [
          '[id^="onetrust-accept"]',
          'button#onetrust-accept-btn-handler',
          'button:has-text("Accept All")',
          'button:has-text("Accept all")',
          'button:has-text("Accept")',
        ];
        for (const s of selectors) {
          const b = page.locator(s).first();
          if (await b.isVisible({ timeout: 1500 }).catch(() => false)) {
            await b.click({ timeout: 1500 }).catch(() => undefined);
            break;
          }
        }
      } catch {
        /* ignore */
      }

      // Let late scripts mutate DOM a bit
      await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => undefined);
      await page.waitForSelector('main, body', { timeout: 10_000 }).catch(() => undefined);
      await page.waitForTimeout(400);

      // ---------------- DESCRIPTION ----------------
      const description =
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
            (nodes) =>
              nodes
                .map((n) => (n.textContent || '').trim())
                .filter(Boolean)
                .join('\n')
                .trim(),
          )
          .catch(() => '')) ||
        (await page
          .evaluate(() => {
            const root = (document.querySelector('main') || document.body)!;
            const heading = Array.from(root.querySelectorAll('h1,h2,h3,h4')).find((h) =>
              /summary|description/i.test(h.textContent || ''),
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

      // ---------------- RATING ----------------
      const ratingText =
        (await page.locator('[itemprop="ratingValue"]').first().textContent().catch(() => null)) ??
        (await page.locator('.rating__value').first().textContent().catch(() => null)) ??
        null;
      const ratingAverage = ratingText ? Number(String(ratingText).replace(/[^\d.]/g, '')) : null;

      // ---------------- IMAGE ----------------
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

          // 1) OpenGraph/Twitter
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

          // 2) JSON-LD
          const ldList = Array.from(
            document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]'),
          );
          for (const s of ldList) {
            try {
              const json = JSON.parse(s.textContent || '{}');
              const types = Array.isArray(json['@type']) ? json['@type'] : [json['@type']];
              if (types?.some((t) => /product|book/i.test(t))) {
                const cand =
                  (Array.isArray(json.image) ? json.image[0] : json.image) ||
                  json?.offers?.image ||
                  null;
                if (cand && !isProbablyLogo(cand)) {
                  const abs = absolutize(cand);
                  if (abs && !isProbablyLogo(abs)) return abs;
                }
              }
            } catch {
              /* ignore */
            }
          }

          // 3) Best DOM candidate
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
            .filter((c) => c.w >= 160 && c.h >= 160);

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

      // ---------------- PRICE (best-effort live) ----------------
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

      // --------- LOG what we found (helps in Render logs) ----------
      this.log.log(
        `Parsed: descLen=${description?.length ?? 0} image=${imageAbs ? 'yes' : 'no'} price=${
          priceNum ?? 'n/a'
        } currency=${currencyDetected ?? 'n/a'}`,
      );

      // ---------------- RECOMMENDATIONS ----------------
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

      // ---------------- Persist ----------------
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
      if (changedProduct) await this.products.save(product);

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
      try {
        await browser?.close();
      } catch {
        /* ignore */
      }
    }
  }
}
