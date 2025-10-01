import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { chromium, devices } from 'playwright';

import { Product } from '../entities/product.entity';
import { ProductDetail } from '../entities/product-detail.entity';
type PWPage = import('playwright').Page;

/* helpers (unchanged from yours) ... absolutize, gotoWithRetry, decodeEntities,
   extractDescription, extractImage, extractPriceAndCurrency ... */

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

  async refreshProduct(productId: string, force = false): Promise<ProductDetail> {
    const now = Date.now();
    const last = this.lastAttempt.get(productId) ?? 0;

    if (this.inFlight.has(productId)) return this.inFlight.get(productId)!;

    // only throttle when NOT forced
    if (!force && now - last < this.ATTEMPT_COOLDOWN_MS) {
      const existing = await this.details.findOne({
        where: { product: { id: productId } },
        relations: { product: true },
      });
      if (existing) return existing;
    }

    const work = this._refreshProduct(productId)
      .catch((e) => {
        this.log.error(`[ScraperService] scrape failed: ${e?.message ?? e}`);
        // rethrow so caller can decide; controllers already swallow for GET path
        throw e;
      })
      .finally(() => this.inFlight.delete(productId));

    this.inFlight.set(productId, work);
    this.lastAttempt.set(productId, now);
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

    const browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
        '--single-process', '--no-zygote',
      ],
    });

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

      await page.locator([
        'button:has-text("Accept all")',
        'button:has-text("Accept All")',
        'button:has-text("Accept cookies")',
        '[aria-label="accept cookies"]',
      ].join(',')).first().click({ timeout: 3_000 }).catch(() => undefined);

      await page.waitForSelector('main, body', { timeout: 10_000 }).catch(() => undefined);
      await page.waitForTimeout(300);

      description = await extractDescription(page);
      imageAbs = await extractImage(page, product.sourceUrl);

      const priceRes = await extractPriceAndCurrency(page);
      priceNum = priceRes.price;
      currencyDetected = priceRes.currency ?? 'GBP';
      unavailable = priceRes.unavailable;
      priceProbes = priceRes.probes;

      const ratingText =
        (await page.locator('[itemprop="ratingValue"]').first().textContent().catch(() => null)) ??
        (await page.locator('.rating__value').first().textContent().catch(() => null)) ?? null;
      ratingAverage = ratingText ? Number(String(ratingText).replace(/[^\d.]/g, '')) : null;
    } finally {
      await browser.close().catch(() => undefined);
    }

    this.log.log(
      `Found: status=${status} img=${!!imageAbs} descLen=${(description || '').length} ` +
      `price=${priceNum ?? 'na'} currency=${currencyDetected ?? 'na'} ` +
      `unavailable=${unavailable} rating=${ratingAverage ?? 'na'} probes=${priceProbes.join(',')}`
    );

    let changedProduct = false;

    if (imageAbs && product.image !== imageAbs) {
      product.image = imageAbs;
      changedProduct = true;
    }

    // reflect availability in price
    if (unavailable || priceNum == null) {
      if (product.price !== null) {
        this.log.log(`Clearing price for ${product.id} (unavailable=${unavailable})`);
        product.price = null;
        changedProduct = true;
      }
    } else if (Number.isFinite(priceNum) && priceNum! > 0 && priceNum! < 2000) {
      if (product.price !== priceNum) {
        this.log.log(`Updating price for ${product.id}: ${product.price ?? 'null'} -> ${priceNum}`);
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
