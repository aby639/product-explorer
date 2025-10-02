import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { chromium, devices } from 'playwright';

import { Product } from '../entities/product.entity';
import { ProductDetail } from '../entities/product-detail.entity';

type PWPage = import('playwright').Page;

/* ------------------------------ helpers ------------------------------ */

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
        attempt++; continue;
      }
      return resp;
    } catch {
      await page.waitForTimeout(500 * Math.pow(2, attempt));
      attempt++;
    }
  }
  return page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => null);
}

// small entity decoder for description
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
          'section:has(h2:has-text("Description")) p, section:has(h3:has-text("Description")) p'
        ].join(','),
        (nodes) => nodes.map(n => (n.textContent || '').trim()).filter(Boolean).join('\n').trim(),
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

        // 3) Largest portrait-like IMG
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
 * Extracts price & currency with World of Books quirks handled:
 *  - If the page says "Currently Unavailable" => unavailable=true and **no price**
 *  - Prefers WOB condition buttons; falls back to LD-JSON, microdata, DOM, HTML
 *  - On WOB we only accept **GBP** prices; USD (or others) are ignored
 */
async function extractPriceAndCurrency(
  page: PWPage,
): Promise<{ price: number | null; currency: string | null; unavailable: boolean; probes: string[] }> {
  const probes: string[] = [];
  const host = new URL(page.url()).host;
  const isWOB = /(^|\.)worldofbooks\.com$/i.test(host);

  // 0) Unavailability detection (authoritative on WOB)
  const unavailable = await page
    .evaluate(() => {
      const scope = document.querySelector('main') || document.body;
      const txt = (scope?.textContent || '').toLowerCase();
      return /currently unavailable|out of stock/i.test(txt);
    })
    .catch(() => false);

  if (unavailable) {
    probes.push('flag:unavailable');
    return { price: null, currency: null, unavailable: true, probes };
  }

  // 1) WOB condition tiles
  const fromWobConditions = await page
    .evaluate(() => {
      const grab = (el: Element | null | undefined) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
      const container =
        document.querySelector('[data-testid="product-conditions"]') ||
        document.querySelector('.product-condition__options') ||
        document.querySelector('main') ||
        document.body;

      const buttons = Array.from(
        container.querySelectorAll<HTMLElement>(
          'button, [role="button"], .product-condition__option, [data-testid*="condition"]',
        ),
      );

      const parseMoney = (s: string) => {
        const m = s.replace(/,/g, '').match(/(\d+(?:\.\d{1,2})?)/);
        return m ? Number(m[1]) : null;
      };

      const items = buttons
        .map((btn) => {
          const text = grab(btn);
          const v = parseMoney(text);
          const selected =
            btn.getAttribute('aria-pressed') === 'true' ||
            btn.getAttribute('aria-checked') === 'true' ||
            btn.classList.contains('is-selected') ||
            btn.classList.contains('selected');
          const disabled =
            btn.getAttribute('aria-disabled') === 'true' ||
            /out of stock|unavailable/i.test(text) ||
            btn.hasAttribute('disabled');
          return { v, selected, disabled };
        })
        .filter((x) => (x.v ?? null) !== null) as Array<{ v: number; selected: boolean; disabled: boolean }>;

      if (!items.length) return null;

      const sel = items.find((x) => x.selected && !x.disabled);
      if (sel) return { price: sel.v, currency: 'GBP' };

      const inStock = items.filter((x) => !x.disabled);
      inStock.sort((a, b) => a.v - b.v);
      if (inStock[0]) return { price: inStock[0].v, currency: 'GBP' };

      return null;
    })
    .catch(() => null);

  if (fromWobConditions && Number.isFinite(fromWobConditions.price)) {
    probes.push('price:wob-conditions');
    return { price: fromWobConditions.price, currency: fromWobConditions.currency, unavailable: false, probes };
  }

  // 2) LD-JSON (skip OutOfStock; on WOB require GBP)
  const fromLd = await page
    .evaluate(() => {
      const out = { price: null as number | null, currency: null as string | null, offers: [] as any[] };
      try {
        const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]'));
        const asArray = (x: any) => (Array.isArray(x) ? x : x ? [x] : []);
        const pushOffer = (o: any) => out.offers.push(o);

        for (const s of scripts) {
          const data = JSON.parse(s.textContent || 'null');
          const list = asArray(data);
          for (const item of list) {
            const t = asArray(item?.['@type']);
            if (!t.some((x: string) => /product|book/i.test(x))) continue;
            asArray(item.offers).forEach(pushOffer);
          }
        }

        // Compute best (lowest) price from acceptable offers
        let best: number | null = null;
        let cur: string | null = null;

        for (const o of out.offers) {
          const avail = String(o?.availability || '').toLowerCase();
          if (avail.includes('outofstock')) continue;
          const raw = o?.lowPrice ?? o?.price ?? o?.priceSpecification?.price;
          const p = typeof raw === 'string' ? Number(raw.replace(/[^\d.]/g, '')) : typeof raw === 'number' ? raw : null;
          const c = o?.priceCurrency ?? o?.priceSpecification?.priceCurrency ?? null;
          if (p != null && p > 0 && p < 2000 && (best == null || p < best)) {
            best = p;
            cur = c || cur;
          }
        }

        out.price = best;
        out.currency = cur;
      } catch {}
      return out;
    })
    .catch(() => ({ price: null, currency: null } as any));

  if (fromLd.price != null) {
    if (!isWOB || fromLd.currency === 'GBP') {
      probes.push('price:ld-json');
      return { price: fromLd.price, currency: fromLd.currency ?? 'GBP', unavailable: false, probes };
    } else {
      // Found LD-JSON but not GBP on WOB — ignore.
      probes.push('price:ld-json-non-gbp-ignored');
    }
  }

  // 3) Microdata/meta
  const fromMicro = await page
    .evaluate(() => {
      const found: Array<{ v: number; c: string | null }> = [];

      document.querySelectorAll('[itemprop="price"]').forEach(el => {
        const v = Number((el.getAttribute('content') || el.getAttribute('value') || el.textContent || '').replace(/[^\d.]/g, ''));
        const c = /£/.test(el.getAttribute('content') || '') ? 'GBP' : null;
        if (Number.isFinite(v)) found.push({ v, c });
      });

      const metaAmt =
        document.querySelector<HTMLMetaElement>('meta[property="product:price:amount"]') ||
        document.querySelector<HTMLMetaElement>('meta[name="product:price:amount"]');
      const metaCur =
        document.querySelector<HTMLMetaElement>('meta[property="product:price:currency"]') ||
        document.querySelector<HTMLMetaElement>('meta[name="product:price:currency"]');
      if (metaAmt) {
        const v = Number((metaAmt.content || '').replace(/[^\d.]/g, ''));
        if (Number.isFinite(v)) found.push({ v, c: (metaCur?.content || null) as any });
      }

      return found;
    })
    .catch(() => [] as Array<{ v: number; c: string | null }>);

  if (fromMicro.length) {
    const sane = fromMicro.filter(x => Number.isFinite(x.v) && x.v > 0 && x.v < 2000);
    sane.sort((a, b) => a.v - b.v);
    const pick = sane[0];
    if (pick && (!isWOB || pick.c === 'GBP')) {
      probes.push('price:micro/meta');
      return { price: pick.v, currency: pick.c ?? 'GBP', unavailable: false, probes };
    }
    probes.push('price:micro-non-gbp-ignored');
  }

  // 4) Generic DOM
  const fromDom = await page
    .evaluate(() => {
      const scope = document.querySelector('main') || document.body;
      const texts: string[] = [];
      scope.querySelectorAll('.formatted-price, .price, [data-testid*="price"], [class*="price"]').forEach(el => {
        const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (t) texts.push(t);
      });
      return texts;
    })
    .catch(() => [] as string[]);
  if (fromDom.length) {
    const joined = fromDom.join(' • ');
    const m = joined.match(/(£|GBP)\s*(\d+(?:\.\d{1,2})?)/i);
    if (m) {
      probes.push('price:dom-generic');
      return { price: Number(m[2]), currency: 'GBP', unavailable: false, probes };
    }
  }

  // 5) HTML fallback
  const html = await page.content().catch(() => '');
  if (html) {
    const m = html.match(/(£|GBP)\s*(\d+(?:\.\d{1,2})?)/i);
    if (m) {
      probes.push('price:html-fallback');
      return { price: Number(m[2]), currency: 'GBP', unavailable: false, probes };
    }
  }

  probes.push('price:none');
  return { price: null, currency: null, unavailable: false, probes };
}

/* -------------------------------- service ------------------------------- */

@Injectable()
export class ScraperService {
  private readonly log = new Logger(ScraperService.name);

  // in-memory throttle per product (avoid SSR double-hits)
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

    this.log.log(`[ScraperService] Scraping ${product.sourceUrl}`);

    let description: string | null = null;
    let imageAbs: string | null = null;
    let priceNum: number | null = null;
    let currencyDetected: string | null = null;
    let ratingAverage: number | null = null;
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
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Referer': new URL(product.sourceUrl).origin + '/',
        },
        locale: 'en-GB',
      });

      const page = await context.newPage();
      await page.waitForTimeout(120 + Math.floor(Math.random() * 200));

      const resp = await gotoWithRetry(page, product.sourceUrl);
      status = resp?.status?.() ?? null;

      // cookie banners (best effort)
      await page.locator(
        ['button:has-text("Accept all")',
         'button:has-text("Accept All")',
         'button:has-text("Accept cookies")',
         '[aria-label="accept cookies"]'].join(',')
      ).first().click({ timeout: 3_000 }).catch(() => undefined);

      await page.waitForSelector('main, body', { timeout: 10_000 }).catch(() => undefined);
      await page.waitForTimeout(300);

      // extract
      description = await extractDescription(page);
      imageAbs = await extractImage(page, product.sourceUrl);

      const priceRes = await extractPriceAndCurrency(page);
      priceNum = priceRes.price;
      currencyDetected = priceRes.currency ?? null;
      unavailable = priceRes.unavailable;
      priceProbes = priceRes.probes;

      // rating (best effort)
      const ratingText =
        (await page.locator('[itemprop="ratingValue"]').first().textContent().catch(() => null)) ??
        (await page.locator('.rating__value').first().textContent().catch(() => null)) ?? null;
      ratingAverage = ratingText ? Number(String(ratingText).replace(/[^\d.]/g, '')) : null;
    } catch (err) {
      scrapeError = err;
      this.log.error(`[ScraperService] scrape failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      await browser.close().catch(() => undefined);
    }

    this.log.log(
      `Found: status=${status} img=${!!imageAbs} descLen=${(description || '').length} price=${priceNum ?? 'na'} ` +
      `currency=${currencyDetected ?? 'na'} unavailable=${unavailable} rating=${ratingAverage ?? 'na'} ` +
      `probes=${priceProbes.join(',')}`,
    );

    // ---------- persist ----------
    let changedProduct = false;

    if (imageAbs && product.image !== imageAbs) {
      product.image = imageAbs;
      changedProduct = true;
    }

    // Only accept GBP on WOB (and only when not unavailable)
    const host = new URL(product.sourceUrl).host;
    const isWOB = /(^|\.)worldofbooks\.com$/i.test(host);
    const acceptThisPrice =
      !unavailable &&
      priceNum != null &&
      Number.isFinite(priceNum) &&
      priceNum! > 0 &&
      priceNum! < 2000 &&
      (!isWOB || currencyDetected === 'GBP');

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
      // Clear price for unavailable or non-GBP (on WOB)
      if (product.price !== null) {
        this.log.log(`Clearing price for ${product.id} (unavailable=${unavailable}, probes=${priceProbes.join(',')})`);
        product.price = null;
        changedProduct = true;
      }
      if (isWOB && product.currency !== 'GBP') {
        product.currency = 'GBP'; // default currency for WOB even when price is null
        changedProduct = true;
      }
    }

    if (changedProduct) await this.products.save(product);

    let detail = await this.details.findOne({
      where: { product: { id: product.id } },
      relations: { product: true },
    });
    if (!detail) detail = this.details.create({ product });

    detail.description = description ? decodeEntities(description) : null;
    detail.ratingAverage = Number.isFinite(ratingAverage as number) ? (ratingAverage as number) : null;
    detail.specs = {
      ...(detail.specs || {}),
      lastStatus: status,
      unavailable,
      priceProbes,
    };
    detail.lastScrapedAt = new Date();

    await this.details.save(detail);
    this.log.log(`Saved detail for ${product.id}`);

    if (scrapeError) throw scrapeError;
    return detail;
  }
}
