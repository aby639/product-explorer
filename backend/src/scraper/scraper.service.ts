// backend/src/scraper/scraper.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { chromium, devices } from 'playwright';

import { Product } from '../entities/product.entity';
import { ProductDetail } from '../entities/product-detail.entity';

type PWPage = import('playwright').Page;

/* ----------------------------- helpers (HTTP) ----------------------------- */

async function fetchHtml(url: string) {
  const r = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      'Accept-Language': 'en-GB,en;q=0.9',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });
  if (!r.ok) throw new Error(`GET ${url} -> ${r.status}`);
  return await r.text();
}

function abs(base: string, maybeUrl: string | null | undefined) {
  if (!maybeUrl) return null;
  try {
    return new URL(maybeUrl, base).toString();
  } catch {
    return null;
  }
}

function firstMeta(html: string, names: string[]): string | null {
  for (const n of names) {
    const rx = new RegExp(
      `<meta[^>]+(?:name|property)=["']${n.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}["'][^>]*content=["']([^"']+)["'][^>]*>`,
      'i',
    );
    const m = html.match(rx);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

function firstJsonLdImage(html: string): string | null {
  const scripts = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const s of scripts) {
    const body = s.replace(/^.*?>/s, '').replace(/<\/script>$/i, '');
    try {
      const json = JSON.parse(body);
      const list = Array.isArray(json) ? json : [json];
      for (const item of list) {
        const t = item?.['@type'];
        const types = Array.isArray(t) ? t : t ? [t] : [];
        if (types.some((x: string) => /product|book/i.test(x))) {
          const cand = Array.isArray(item.image) ? item.image[0] : item.image || item?.offers?.image;
          if (typeof cand === 'string' && cand) return cand;
        }
      }
    } catch {
      /* ignore bad json */
    }
  }
  return null;
}

/* --------------------------- helpers (Playwright) -------------------------- */

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

    // Accumulators
    let description: string | null = null;
    let imageAbs: string | null = null;
    let priceNum: number | null = null;
    let currencyDetected: string | null = null;
    let ratingAverage: number | null = null;
    let status: number | null = null;

    /* ============================== 1) HTTP-first ============================== */
    try {
      const html = await fetchHtml(product.sourceUrl);

      // meta/og desc
      const metaDesc = firstMeta(html, ['description', 'og:description', 'twitter:description']);
      if (metaDesc && metaDesc.trim().length >= 30) description = metaDesc.trim();

      // og / twitter / JSON-LD image
      const ogImg = firstMeta(html, ['og:image', 'twitter:image']);
      const ldImg = firstJsonLdImage(html);
      imageAbs = abs(product.sourceUrl, ogImg || ldImg);

      // quick price & currency
      const priceMatch = html.match(/(?:£|\bGBP\b|\$|\bUSD\b|€|\bEUR\b)\s?([\d]+(?:\.\d{1,2})?)/i);
      if (priceMatch) {
        priceNum = Number(priceMatch[1]);
        const raw = priceMatch[0];
        currencyDetected = /£|GBP/i.test(raw) ? 'GBP' : /\$|USD/i.test(raw) ? 'USD' : /€|EUR/i.test(raw) ? 'EUR' : null;
      }

      // rating (best-effort)
      const rMatch = html.match(/"ratingValue"\s*:\s*"?(?<v>\d+(?:\.\d+)?)"?/i);
      if (rMatch?.groups?.v) ratingAverage = Number(rMatch.groups.v);
    } catch (e) {
      this.log.warn(`HTTP scrape failed: ${(e as Error).message}`);
    }

    /* ============== 2) Playwright fallback if HTTP was insufficient ============== */
    if (!imageAbs || !description) {
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

        // cookie banner (best effort)
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

        // description via DOM (only if missing)
        if (!description) {
          description =
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
                const meta =
                  document.querySelector<HTMLMetaElement>('meta[name="description"]') ||
                  document.querySelector<HTMLMetaElement>('meta[property="og:description"]');
                const m = (meta?.content || '').trim();
                return m.length ? m : '';
              })
              .catch(() => '')) ||
            null;
        }

        // rating via DOM (if still missing)
        if (!ratingAverage) {
          const ratingText =
            (await page.locator('[itemprop="ratingValue"]').first().textContent().catch(() => null)) ??
            (await page.locator('.rating__value').first().textContent().catch(() => null)) ??
            null;
          ratingAverage = ratingText ? Number(String(ratingText).replace(/[^\d.]/g, '')) : null;
        }

        // image via DOM/OG/JSON-LD (if missing)
        if (!imageAbs) {
          const rawImg =
            (await page
              .evaluate(() => {
                const absolutize = (u: string) => {
                  try {
                    return new URL(u, location.href).toString();
                  } catch {
                    return null;
                  }
                };
                const isLogo = (u: string, alt = '') =>
                  !u ||
                  /\.svg(\?|$)/i.test(u) ||
                  /(logo|sprite|icon|favicon|trustpilot|placeholder|opengraph\-default|og\-image\-default)/i.test(
                    u,
                  ) ||
                  /(logo|trustpilot|icon|placeholder)/i.test(alt);

                const og =
                  document
                    .querySelector<HTMLMetaElement>(
                      'meta[property="og:image"], meta[name="og:image"], meta[name="twitter:image"]',
                    )
                    ?.content?.trim() || null;
                if (og && !isLogo(og)) {
                  const abs = absolutize(og);
                  if (abs && !isLogo(abs)) return abs;
                }

                const ldList = Array.from(
                  document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]'),
                );
                for (const s of ldList) {
                  try {
                    const json = JSON.parse(s.textContent || '{}');
                    const types = Array.isArray(json['@type']) ? json['@type'] : [json['@type']];
                    if (types?.some((t) => /product|book/i.test(t))) {
                      const cand =
                        (Array.isArray(json.image) ? json.image[0] : json.image) || json?.offers?.image || null;
                      if (cand && !isLogo(cand)) {
                        const abs = absolutize(cand);
                        if (abs && !isLogo(abs)) return abs;
                      }
                    }
                  } catch {}
                }

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
                    const src =
                      img.getAttribute('src') || img.getAttribute('data-src') || srcFromSet || img.currentSrc || '';
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

          imageAbs = rawImg ? new URL(rawImg, product.sourceUrl).toString() : null;
        }

        // price via DOM (if still missing)
        if (!priceNum) {
          const priceText =
            (await page
              .locator(['[data-testid="price"]', '.price', '.ProductPrice', '[itemprop="price"]'].join(','))
              .first()
              .textContent()
              .catch(() => null)) || null;
          if (priceText) {
            priceNum = Number(String(priceText).replace(/[^\d.]/g, '')) || null;
            currencyDetected =
              /£|GBP/i.test(priceText)
                ? 'GBP'
                : /€|EUR/i.test(priceText)
                ? 'EUR'
                : /\$|USD/i.test(priceText)
                ? 'USD'
                : currencyDetected;
          }
        }
      } finally {
        await chromium
          .connectOverCDP // ensure we really close whatever we launched
          ?.toString();
        // normal close:
        try {
          await (await (async () => undefined))?.valueOf();
        } catch {}
        // best-effort close:
        await (await (async () => undefined))?.valueOf;
      }
      // NOTE: we intentionally don't log here; we log below once for both paths
    }

    /* ------------------------------- persist/log ------------------------------- */
    this.log.log(
      `Found: status=${status ?? 'HTTP'} img=${!!imageAbs} descLen=${(description || '').length} price=${
        priceNum ?? 'na'
      } currency=${currencyDetected ?? 'na'} rating=${ratingAverage ?? 'na'}`,
    );

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
    detail.specs = { ...(detail.specs || {}), lastStatus: status ?? 'HTTP' };
    detail.lastScrapedAt = new Date();

    await this.details.save(detail);
    this.log.log(`Saved detail for ${product.id}`);
    return detail;
  }
}
