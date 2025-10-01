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
          // very generic fallback in summary-like sections
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
 * Price extractor hardened for World of Books:
 *  - Prefer selected condition in the segmented control
 *  - Else lowest in-stock condition
 *  - Else main DOM price
 *  - Else LD-JSON / microdata / HTML fallbacks
 */
async function extractPriceAndCurrency(
  page: PWPage,
): Promise<{ price: number | null; currency: string | null; unavailable: boolean; probes: string[] }> {
  const probes: string[] = [];

  const unavailable = await page
    .evaluate(() => {
      const scope = document.querySelector('main') || document.body;
      const txt = (scope?.textContent || '').toLowerCase();
      return txt.includes('currently unavailable') || txt.includes('out of stock');
    })
    .catch(() => false);
  if (unavailable) probes.push('flag:unavailable');

  /* -------- 1) WoB "Select Condition" segmented control (new markup) -------- */
  const fromWobSegment = await page.evaluate(() => {
    const grab = (el: Element | null | undefined) => (el?.textContent || '').replace(/\s+/g, ' ').trim();

    const label = Array.from(document.querySelectorAll('label, h3, h4, p, span'))
      .find(el => /select\s+condition/i.test(el.textContent || ''));
    const container = label?.parentElement?.closest('section') || label?.parentElement || document.body;

    const candidates = Array.from(
      (container || document).querySelectorAll<HTMLElement>(
        [
          '.segmented-control__option',
          '[role="radio"]',
          '[aria-pressed]',
          '.product-condition__option',
          '[data-testid*="condition"]',
          'button',
        ].join(','),
      ),
    ).filter(Boolean);

    if (!candidates.length) return null as null | { price: number; currency: string };

    const parsed = candidates
      .map(btn => {
        const text = grab(btn);
        const disabled = btn.getAttribute('aria-disabled') === 'true' || /out of stock/i.test(text);
        const selected =
          btn.classList.contains('is-selected') ||
          btn.getAttribute('aria-checked') === 'true' ||
          btn.getAttribute('aria-pressed') === 'true' ||
          btn.getAttribute('data-state') === 'on' ||
          /selected/i.test(text);
        const money = text.match(/(£|gbp)\s*(\d+(?:\.\d{1,2})?)/i);
        const v = money ? Number(money[2]) : null;
        const c = money ? 'GBP' : null;
        return { v, c, disabled, selected };
      })
      .filter(x => x.v != null && !x.disabled) as Array<{ v: number; c: string | null; selected: boolean }>;

    if (!parsed.length) return null;

    const sel = parsed.find(x => x.selected);
    if (sel) return { price: sel.v!, currency: sel.c || 'GBP' };

    parsed.sort((a, b) => a.v! - b.v!);
    return { price: parsed[0].v!, currency: parsed[0].c || 'GBP' };
  }).catch(() => null);

  if (fromWobSegment && Number.isFinite(fromWobSegment.price)) {
    probes.push('price:wob-segmented');
    return { price: fromWobSegment.price, currency: fromWobSegment.currency, unavailable, probes };
  }

  /* ---------------- 2) JSON-LD (can be lowPrice; prefer DOM if possible) --- */
  const fromLd = await page
    .evaluate(() => {
      const out = { price: null as number | null, currency: null as string | null };
      try {
        const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]'));
        let best: number | null = null;
        let cur: string | null = null;
        const touchOffer = (o: any) => {
          const raw = o?.lowPrice ?? o?.price ?? o?.priceSpecification?.price;
          const p = typeof raw === 'string' ? Number(raw.replace(/[^\d.]/g, '')) : typeof raw === 'number' ? raw : null;
          const c = o?.priceCurrency ?? o?.priceSpecification?.priceCurrency ?? null;
          if (p != null && p > 0 && p < 1000 && (best == null || p < best)) { best = p; cur = c || cur; }
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

  /* ------------------- 3) Main DOM price near product title ----------------- */
  const fromMainDom = await page
    .evaluate(() => {
      const scope = document.querySelector('main') || document.body;
      const pick = (...sels: string[]) => {
        for (const sel of sels) {
          const el = scope.querySelector<HTMLElement>(sel);
          if (el) return el.textContent || '';
        }
        return '';
      };
      const txt = pick(
        '.product-price__current',
        '.product-price',
        '.price__current',
        '.price__amount',
        '[data-testid*="price"]',
        '.price',
        '.product__price',
        'h1 + *:has(.price), h1 + .price',
      );
      return txt;
    })
    .catch(() => '');

  if (fromMainDom) {
    const m = fromMainDom.match(/(£|GBP)\s*(\d+(?:\.\d{1,2})?)/i);
    if (m) {
      probes.push('price:main-dom');
      return { price: Number(m[2]), currency: 'GBP', unavailable, probes };
    }
  }

  /* -------------------------- 4) Fall back to JSON-LD ----------------------- */
  if (fromLd.price != null) {
    probes.push('price:ld-json');
    return { price: fromLd.price, currency: fromLd.currency ?? 'GBP', unavailable, probes };
  }

  /* ---------------------- 5) Micro/meta + generic DOM ----------------------- */
  const fromMicro = await page
    .evaluate(() => {
      const found: Array<{ v: number; c: string | null }> = [];
      const push = (v: any, c: string | null) => { const n = Number(String(v).replace(/[^\d.]/g, '')); if (isFinite(n)) found.push({ v: n, c }); };

      document.querySelectorAll('[itemprop="price"]').forEach(el => push(el.getAttribute('content') || el.textContent || '', null));
      const metaAmt =
        document.querySelector<HTMLMetaElement>('meta[property="product:price:amount"], meta[name="product:price:amount"]');
      const metaCur =
        document.querySelector<HTMLMetaElement>('meta[property="product:price:currency"], meta[name="product:price:currency"]');
      if (metaAmt) push(metaAmt.content, metaCur?.content || null);

      document.querySelectorAll<HTMLElement>('.price, .formatted-price, [data-price]').forEach(el => push(el.dataset.price || el.textContent || '', null));
      return found;
    })
    .catch(() => [] as Array<{ v: number; c: string | null }>);

  if (fromMicro.length) {
    probes.push('price:micro/meta');
    const sane = fromMicro.filter(x => x.v > 0 && x.v < 1000).sort((a, b) => a.v - b.v);
    if (sane[0]) return { price: sane[0].v, currency: sane[0].c || 'GBP', unavailable, probes };
  }

  /* ---------------------------- 6) Raw HTML text ---------------------------- */
  const html = await page.content().catch(() => '');
  if (html) {
    const m = html.match(/(£|GBP)\s*(\d+(?:\.\d{1,2})?)/i);
    if (m) {
      probes.push('price:html-fallback');
      return { price: Number(m[2]), currency: 'GBP', unavailable, probes };
    }
  }

  probes.push('price:none');
  return { price: null, currency: null, unavailable, probes };
}

/* --------------------------------- service -------------------------------- */

@Injectable()
export class ScraperService {
  private readonly log = new Logger(ScraperService.name);

  // in-memory per-product mutex + “last attempt” throttle (protects against SSR double hits)
  private inFlight = new Map<string, Promise<ProductDetail>>();
  private lastAttempt = new Map<string, number>();
  private readonly ATTEMPT_COOLDOWN_MS = 15_000; // 15s gate between scrapes

  constructor(
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(ProductDetail) private readonly details: Repository<ProductDetail>,
  ) {}

  // NOTE: controller should pass force=true if query ?refresh=true
  async refreshProduct(productId: string, force = false): Promise<ProductDetail> {
    const now = Date.now();
    const last = this.lastAttempt.get(productId) ?? 0;

    if (!force) {
      if (now - last < this.ATTEMPT_COOLDOWN_MS && this.inFlight.has(productId)) {
        return this.inFlight.get(productId)!;
      }
      if (now - last < this.ATTEMPT_COOLDOWN_MS && !this.inFlight.has(productId)) {
        const existing = await this.details.findOne({
          where: { product: { id: productId } },
          relations: { product: true },
        });
        if (existing) return existing;
      }
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
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Referer': new URL(product.sourceUrl).origin + '/',
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
      `Found: status=${status} img=${!!imageAbs} descLen=${(description || '').length} price=${
        priceNum ?? 'na'
      } currency=${currencyDetected ?? 'na'} unavailable=${unavailable} rating=${ratingAverage ?? 'na'} probes=${priceProbes.join(',')}`,
    );

    let changedProduct = false;

    if (imageAbs && product.image !== imageAbs) {
      product.image = imageAbs;
      changedProduct = true;
    }

    // If page is marked unavailable, always clear price to avoid stale values.
    if (unavailable) {
      if (product.price !== null) {
        product.price = null;
        changedProduct = true;
      }
    } else if (Number.isFinite(priceNum as number) && (priceNum as number) > 0 && (priceNum as number) < 1000) {
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
