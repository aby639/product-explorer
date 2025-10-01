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

// tiny HTML entity decoder (enough for our text snippets)
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
        const absolutize = (u: string) => {
          try { return new URL(u, location.href).toString(); } catch { return null; }
        };
        const isLogo = (u: string, alt = '') =>
          !u ||
          /\.svg(\?|$)/i.test(u) ||
          /(logo|sprite|icon|favicon|trustpilot|placeholder|opengraph\-default|og\-image\-default)/i.test(u) ||
          /(logo|trustpilot|icon|placeholder)/i.test(alt);

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
 * Price extractor tuned for WOB:
 * 1) Prefer visible DOM near “Select Condition” / “Add To Basket”
 * 2) Then condition tiles (if present)
 * 3) Then microdata/meta
 * 4) Then JSON-LD
 * 5) Then raw HTML fallback
 */
async function extractPriceAndCurrency(
  page: PWPage,
): Promise<{ price: number | null; currency: string | null; unavailable: boolean; probes: string[] }> {
  const probes: string[] = [];

  // 0) Unavailable early
  const unavailable = await page
    .evaluate(() => {
      const scope = document.querySelector('main') || document.body;
      const txt = (scope?.textContent || '').toLowerCase();
      return txt.includes('currently unavailable') || txt.includes('out of stock');
    })
    .catch(() => false);
  if (unavailable) probes.push('flag:unavailable');

  // helpers
  const readMoney = (s: string) => {
    const m = s.replace(/,/g, '').match(/(\d+(?:\.\d{1,2})?)/);
    return m ? Number(m[1]) : null;
  };
  const inRange = (n: any) => Number.isFinite(n) && n > 0 && n < 1000;

  // 1) Visible DOM near buy/condition areas
  const fromPrimaryDom = await page
    .evaluate(() => {
      const grab = (el: Element | null | undefined) => (el?.textContent || '').replace(/\s+/g, ' ').trim();

      // sections around “Add To Basket” or “Select Condition”
      const basket = Array.from(document.querySelectorAll('button, a')).find(n =>
        /add\s*to\s*basket/i.test(n.textContent || ''),
      );
      const conditionLabel = Array.from(document.querySelectorAll('*')).find(n =>
        /select\s*condition/i.test(n.textContent || ''),
      );

      const candidateText: string[] = [];
      const scope1 = basket?.closest('section') || basket?.parentElement;
      const scope2 = conditionLabel?.closest('section') || conditionLabel?.parentElement;
      if (scope1) candidateText.push(grab(scope1));
      if (scope2) candidateText.push(grab(scope2));

      // also the first strong price-looking node under the title area
      const title = document.querySelector('h1');
      if (title) {
        let next: Element | null = title.nextElementSibling;
        for (let i = 0; i < 6 && next; i++, next = next.nextElementSibling) {
          candidateText.push(grab(next));
        }
      }

      const joined = candidateText.filter(Boolean).join(' • ');
      const m = joined.match(/(£|GBP)\s*(\d+(?:\.\d{1,2})?)/i);
      if (m) return { price: Number(m[2]), currency: 'GBP' as const };
      return null;
    })
    .catch(() => null as { price: number; currency: 'GBP' } | null);
  if (fromPrimaryDom && inRange(fromPrimaryDom.price)) {
    probes.push('price:dom-primary');
    return { price: fromPrimaryDom.price, currency: fromPrimaryDom.currency, unavailable, probes };
  }

  // 2) WOB condition tiles
  const fromTiles = await page
    .evaluate(() => {
      const grab = (el: Element | null | undefined) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
      const container =
        document.querySelector('.product-condition__options') ||
        document.querySelector('[data-testid="product-conditions"]') ||
        document.body;

      const tiles = Array.from(
        container.querySelectorAll<HTMLElement>('.product-condition__option, [data-testid*="condition"]'),
      );
      if (!tiles.length) return null as null | { price: number; currency: string };

      const parsed = tiles
        .map(t => {
          const text = grab(t);
          const m = text.match(/(£|GBP)\s*(\d+(?:\.\d{1,2})?)/i);
          const v = m ? Number(m[2]) : null;
          const selected = t.classList.contains('is-selected') || t.getAttribute('aria-checked') === 'true';
          const disabled = t.getAttribute('aria-disabled') === 'true' || /out of stock/i.test(text);
          return { v, selected, disabled };
        })
        .filter(x => x.v && !x.disabled) as Array<{ v: number; selected: boolean }>;

      if (!parsed.length) return null;
      const sel = parsed.find(x => x.selected);
      if (sel) return { price: sel.v, currency: 'GBP' };
      parsed.sort((a, b) => a.v - b.v);
      return { price: parsed[0].v, currency: 'GBP' };
    })
    .catch(() => null);
  if (fromTiles && inRange(fromTiles.price)) {
    probes.push('price:wob-tiles');
    return { price: fromTiles.price, currency: fromTiles.currency, unavailable, probes };
  }

  // 3) Microdata / meta
  const fromMicro = await page
    .evaluate(() => {
      const found: number[] = [];

      // schema.org price content/value/text
      document.querySelectorAll('[itemprop="price"]').forEach(el => {
        const v = Number(
          (el.getAttribute('content') || el.getAttribute('value') || el.textContent || '').replace(/[^\d.]/g, ''),
        );
        if (Number.isFinite(v)) found.push(v);
      });

      // meta product:price:amount
      const metaAmt =
        document.querySelector<HTMLMetaElement>('meta[property="product:price:amount"]') ||
        document.querySelector<HTMLMetaElement>('meta[name="product:price:amount"]');
      if (metaAmt) {
        const v = Number((metaAmt.content || '').replace(/[^\d.]/g, ''));
        if (Number.isFinite(v)) found.push(v);
      }

      return found;
    })
    .catch(() => [] as number[]);
  if (fromMicro.length) {
    fromMicro.sort((a, b) => a - b);
    const v = fromMicro[0];
    if (inRange(v)) {
      probes.push('price:micro/meta');
      return { price: v, currency: 'GBP', unavailable, probes };
    }
  }

  // 4) JSON-LD
  const fromLd = await page
    .evaluate(() => {
      const out = { price: null as number | null, currency: null as string | null };
      try {
        const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]'));
        let best: number | null = null;
        const touchOffer = (o: any) => {
          const raw = o?.lowPrice ?? o?.price ?? o?.priceSpecification?.price;
          const p = typeof raw === 'string' ? Number(raw.replace(/[^\d.]/g, '')) : typeof raw === 'number' ? raw : null;
          if (p != null) best = best == null ? p : Math.min(best, p);
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
        out.currency = best != null ? 'GBP' : null;
      } catch {}
      return out;
    })
    .catch(() => ({ price: null, currency: null }));
  if (fromLd.price != null && inRange(fromLd.price)) {
    probes.push('price:ld-json');
    return { price: fromLd.price, currency: fromLd.currency ?? 'GBP', unavailable, probes };
  }

  // 5) Raw HTML fallback
  const html = await page.content().catch(() => '');
  if (html) {
    const m = html.match(/(£|GBP)\s*(\d+(?:\.\d{1,2})?)/i);
    if (m) {
      probes.push('price:html');
      const v = Number(m[2]);
      if (inRange(v)) return { price: v, currency: 'GBP', unavailable, probes };
    }
  }

  probes.push('price:none');
  return { price: null, currency: null, unavailable, probes };
}

/* --------------------------------- service -------------------------------- */

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
    if (now - last < this.ATTEMPT_COOLDOWN_MS && this.inFlight.has(productId)) {
      return this.inFlight.get(productId)!;
    }
    if (this.inFlight.has(productId)) return this.inFlight.get(productId)!;
    const work = this._refreshProduct(productId).finally(() => this.inFlight.delete(productId));
    this.inFlight.set(productId, work);
    this.lastAttempt.set(productId, now);
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
    let priceProbes: string[] = [];

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
          Referer: new URL(product.sourceUrl).origin + '/',
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

      // ---- extract fields ----
      description = await extractDescription(page);
      imageAbs = await extractImage(page, product.sourceUrl);

      const priceRes = await extractPriceAndCurrency(page);
      priceNum = priceRes.price;
      currencyDetected = priceRes.currency ?? 'GBP';
      unavailable = priceRes.unavailable;
      priceProbes = priceRes.probes;

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
      `Found: status=${status} img=${!!imageAbs} descLen=${(description || '').length} price=${priceNum ?? 'na'} currency=${
        currencyDetected ?? 'na'
      } unavailable=${unavailable} rating=${ratingAverage ?? 'na'} probes=${priceProbes.join(',')}`,
    );

    let changedProduct = false;

    if (imageAbs && product.image !== imageAbs) {
      product.image = imageAbs;
      changedProduct = true;
    }

    // If page is unavailable, store price as null (so UI doesn’t mislead)
    if (unavailable) {
      if (product.price !== null) {
        product.price = null;
        changedProduct = true;
      }
    } else if (inRange(priceNum)) {
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

    detail.description = description ? decodeEntities(description) : null;
    detail.ratingAverage = Number.isFinite(ratingAverage as number) ? (ratingAverage as number) : null;
    detail.specs = { ...(detail.specs || {}), lastStatus: status, unavailable, priceProbes };
    detail.lastScrapedAt = new Date();

    await this.details.save(detail);
    this.log.log(`Saved detail for ${product.id}`);
    return detail;
  }
}

function inRange(n: any) {
  return Number.isFinite(n) && n > 0 && n < 1000;
}
