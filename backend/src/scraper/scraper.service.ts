import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { chromium, devices } from 'playwright';

import { Product } from '../entities/product.entity';
import { ProductDetail } from '../entities/product-detail.entity';

type PWPage = import('playwright').Page;

/* ------------------------------ helpers ------------------------------ */

function toHttps(u?: string | null): string | null {
  if (!u) return u ?? null;
  try {
    const url = new URL(u);
    if (url.protocol === 'http:') url.protocol = 'https:';
    return url.toString();
  } catch {
    return u;
  }
}

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

/* ------------------------- DOM extraction helpers ------------------------- */

async function extractDescription(page: PWPage): Promise<string | null> {
  const raw =
    (await page
      .$$eval(
        [
          'section:has(h2:has-text("Summary")) p',
          'section:has(h3:has-text("Summary")) p',
          'section:has(h2:has-text("Summary")) div',
          '#description p, #description div',
          '.ProductDescription p, .product-description p',
          '[data-testid="product-description"] p, [data-testid="product-description"] div',
          'section:has(h2:has-text("Description")) p, section:has(h3:has-text("Description")) p',
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
            const text = Array.from(section.querySelectorAll('p,div'))
              .map((p) => (p.textContent || '').trim())
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

async function extractImage(page: PWPage): Promise<string | null> {
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

        // OG/Twitter first
        const og =
          document
            .querySelector<HTMLMetaElement>('meta[property="og:image"], meta[name="og:image"], meta[name="twitter:image"]')
            ?.content?.trim() || null;
        if (og && !isLogo(og)) return absolutize(og);

        // JSON-LD Product/Book image
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

        // Best portrait IMG
        const root = document.querySelector('main') || document.body;
        const imgs = Array.from(root.querySelectorAll<HTMLImageElement>('img'));
        const candidates = imgs
          .map((img) => {
            const srcset = img.getAttribute('srcset');
            const srcFromSet = srcset?.split(',')?.map((s) => s.trim().split(' ')[0])?.filter(Boolean)?.pop() || null;
            const src = img.getAttribute('src') || img.getAttribute('data-src') || srcFromSet || img.currentSrc || '';
            const alt = (img.getAttribute('alt') || '').toLowerCase();
            const r = img.getBoundingClientRect();
            const area = r.width * r.height;
            const ratio = r.height / Math.max(1, r.width);
            return { src, alt, area, ratio, w: r.width, h: r.height };
          })
          .filter((c) => c.src && !isLogo(c.src, c.alt))
          .filter((c) => c.w >= 180 && c.h >= 180);

        const score = (c: any) => c.area * (c.ratio >= 1.2 ? 2 : 1);
        candidates.sort((a, b) => score(b) - score(a));
        const best = candidates[0]?.src || null;
        return best ? absolutize(best) : null;
      })
      .catch(() => null)) || null;

  return raw;
}

/** JSON-LD & HTML fallbacks for rating and review count */
async function extractRating(page: PWPage): Promise<{ value: number | null; count: number | null }> {
  // Try JSON-LD first
  const ld = await page.evaluate(() => {
    const result = { ratingValue: null as number | null, ratingCount: null as number | null };
    try {
      const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]'));
      const asArray = (x: any) => (Array.isArray(x) ? x : x ? [x] : []);
      for (const s of scripts) {
        const data = JSON.parse(s.textContent || 'null');
        for (const item of asArray(data)) {
          const types = asArray(item?.['@type']);
          if (!types.some((t: string) => /product|book/i.test(t))) continue;
          const agg = item?.aggregateRating ?? item?.AggregateRating ?? null;
          if (!agg) continue;
          const val = Number(String(agg?.ratingValue ?? agg?.rating ?? '').replace(/[^\d.]/g, ''));
          const cnt = Number(String(agg?.reviewCount ?? agg?.ratingCount ?? '').replace(/[^\d]/g, ''));
          if (Number.isFinite(val)) result.ratingValue = val;
          if (Number.isFinite(cnt)) result.ratingCount = cnt;
        }
      }
    } catch {}
    return result;
  }).catch(() => ({ ratingValue: null, ratingCount: null }));

  if (ld.ratingValue != null || ld.ratingCount != null) {
    return { value: ld.ratingValue, count: ld.ratingCount };
  }

  // Microdata minimal fallback
  const html = await page.evaluate(() => {
    const vEl = document.querySelector('[itemprop="ratingValue"]');
    const cEl =
      document.querySelector('[itemprop="reviewCount"]') ||
      document.querySelector('[itemprop="ratingCount"]');
    const v = vEl ? Number((vEl.getAttribute('content') || vEl.textContent || '').replace(/[^\d.]/g, '')) : null;
    const c = cEl ? Number((cEl.getAttribute('content') || cEl.textContent || '').replace(/[^\d]/g, '')) : null;
    return { v: Number.isFinite(v as number) ? (v as number) : null, c: Number.isFinite(c as number) ? (c as number) : null };
  }).catch(() => ({ v: null, c: null }));

  return { value: html.v, count: html.c };
}

/* -------------------------------- service ------------------------------- */

@Injectable()
export class ScraperService {
  private readonly log = new Logger(ScraperService.name);
  private inFlight = new Map<string, Promise<ProductDetail>>();
  private lastAttempt = new Map<string, number>();
  private readonly ATTEMPT_COOLDOWN_MS = 15_000;

  constructor(
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(ProductDetail) private readonly details: Repository<ProductDetail>,
  ) {}

  async refreshProduct(productId: string): Promise<ProductDetail> {
    const now = Date.now();
    const last = this.lastAttempt.get(productId) ?? 0;

    if (this.inFlight.has(productId)) return this.inFlight.get(productId)!;
    if (now - last < this.ATTEMPT_COOLDOWN_MS && this.inFlight.has(productId)) {
      return this.inFlight.get(productId)!;
    }
    this.lastAttempt.set(productId, now);

    const work = this._refreshProduct(productId).finally(() => this.inFlight.delete(productId));
    this.inFlight.set(productId, work);
    return work;
  }

  private async _refreshProduct(productId: string): Promise<ProductDetail> {
    const product = await this.products.findOne({ where: { id: productId } });
    if (!product?.sourceUrl) throw new Error('Product has no sourceUrl');

    product.sourceUrl = toHttps(product.sourceUrl);
    await this.products.save(product).catch(() => undefined);

    this.log.log(`[ScraperService] Scraping ${product.sourceUrl}`);

    let description: string | null = null;
    let imageAbs: string | null = null;
    let priceNum: number | null = null;
    let currencyDetected: string | null = null;
    let ratingAverage: number | null = null;
    let ratingCount: number | null = null;
    let status: number | null = null;
    let unavailable = false;
    let priceProbes: string[] = [];
    let scrapeError: any = null;

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
          Referer: new URL(product.sourceUrl!).origin + '/',
        },
        locale: 'en-GB',
      });

      const page = await context.newPage();
      await page.waitForTimeout(120 + Math.floor(Math.random() * 200));

      const resp = await gotoWithRetry(page, product.sourceUrl!);
      status = resp?.status?.() ?? null;

      // cookie banners (best effort)
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

      description = await extractDescription(page);
      imageAbs = await extractImage(page);

      const priceRes = await extractPriceAndCurrency(page);
      priceNum = priceRes.price;
      currencyDetected = priceRes.currency ?? null;
      unavailable = priceRes.unavailable;
      priceProbes = priceRes.probes;

      // rating (JSON-LD + fallbacks)
      const r = await extractRating(page);
      ratingAverage = Number.isFinite(r.value as number) ? (r.value as number) : null;
      ratingCount = Number.isFinite(r.count as number) ? (r.count as number) : null;
    } catch (err) {
      scrapeError = err;
      this.log.error(`[ScraperService] scrape failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      await browser.close().catch(() => undefined);
    }

    this.log.log(
      `Found: status=${status} img=${!!imageAbs} descLen=${(description || '').length} price=${priceNum ?? 'na'} ` +
      `currency=${currencyDetected ?? 'na'} unavailable=${unavailable} rating=${ratingAverage ?? 'na'} ` +
      `reviews=${ratingCount ?? 'na'} probes=${priceProbes.join(',')}`,
    );

    // ---------- persist ----------
    let changedProduct = false;

    if (imageAbs) {
      const httpsImg = toHttps(imageAbs);
      if (httpsImg && product.image !== httpsImg) {
        product.image = httpsImg;
        changedProduct = true;
      }
    }

    // Only accept GBP on WOB (and only when not unavailable)
    const wob = /(^|\.)worldofbooks\.com$/i.test(new URL(product.sourceUrl!).host);
    const acceptThisPrice =
      !unavailable &&
      priceNum != null &&
      Number.isFinite(priceNum) &&
      priceNum! > 0 &&
      priceNum! < 2000 &&
      (!wob || currencyDetected === 'GBP');

    if (acceptThisPrice) {
      if (product.price !== priceNum) {
        this.log.log(`Updating price for ${product.id}: ${product.price ?? 'null'} -> ${priceNum}`);
        product.price = priceNum!;
        changedProduct = true;
      }
      if (currencyDetected && product.currency !== currencyDetected) {
        product.currency = currencyDetected;
        changedProduct = true;
      }
    } else {
      if (product.price !== null) {
        this.log.log(`Clearing price for ${product.id} (unavailable=${unavailable}, probes=${priceProbes.join(',')})`);
        product.price = null;
        changedProduct = true;
      }
      if (wob && product.currency !== 'GBP') {
        product.currency = 'GBP';
        changedProduct = true;
      }
    }

    if (changedProduct) await this.products.save(product);

    // Get or create detail
    let detail = await this.details.findOne({ where: { product: { id: product.id } } });
    if (!detail) detail = this.details.create({ product });

    const scrapedAt = new Date();

    detail.description = description ? decodeEntities(description) : null;
    detail.ratingAverage = Number.isFinite(ratingAverage as number) ? (ratingAverage as number) : null;
    detail.specs = {
      ...(detail.specs || {}),
      lastStatus: status,
      unavailable,
      priceProbes,
      lastScrapedAtISO: scrapedAt.toISOString(),
      sourceUrl: product.sourceUrl ?? null,
      reviewsCount: ratingCount ?? null, // <— keep review count in the JSON bag
    };
    detail.lastScrapedAt = scrapedAt;

    const saved = await this.details.save(detail);
    (saved as any).product = undefined;

    this.log.log(`Saved detail for ${product.id}`);

    if (scrapeError) throw scrapeError;
    return saved;
  }
}
