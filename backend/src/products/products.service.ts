import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Product } from '../entities/product.entity';
import { ProductDetail } from '../entities/product-detail.entity';
import { ScraperService } from '../scraper/scraper.service';

@Injectable()
export class ProductsService {
  private readonly log = new Logger(ProductsService.name);

  constructor(
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(ProductDetail) private readonly details: Repository<ProductDetail>,
    private readonly scraper: ScraperService,
  ) {}

  /** List grid with optional category slug + pagination */
  async list(params: { category?: string; page?: number; limit?: number }) {
    const page = Math.max(1, Number(params.page ?? 1));
    const take = Math.min(24, Math.max(1, Number(params.limit ?? 12)));
    const skip = (page - 1) * take;

    const [items, total] = await this.products.findAndCount({
      where: params.category ? ({ category: { slug: params.category } } as any) : {},
      order: { title: 'ASC' },
      take,
      skip,
      // no relations needed for grid
    });

    // Return plain JSON objects (avoid class instances just in case)
    const clean = items.map((p) => ({
      id: p.id,
      title: p.title,
      image: p.image ?? null,
      price: p.price ?? null,
      currency: p.currency ?? null,
    }));

    return { items: clean, total, page, limit: take, pageSize: take };
  }

  /** Get one product, with (optional) background refresh */
  async getOne(id: string, refresh?: boolean) {
    if (!id) throw new NotFoundException('Product not found');

    const product = await this.products.findOne({
      where: { id },
      relations: { category: true }, // ok, not circular
    });
    if (!product) throw new NotFoundException('Product not found');

    // Background refresh if requested (fire-and-forget)
    if (refresh) {
      this.scraper.refreshProduct(id).catch((err) => {
        this.log.warn(`refreshProduct failed for ${id}: ${err instanceof Error ? err.message : String(err)}`);
      });
    }

    // IMPORTANT: do NOT load detail.product (prevents circular JSON)
    const detail =
      (await this.details.findOne({
        where: { product: { id } },
        // relations: { product: true }, // ⛔️ do not include
      })) || null;

    const out = {
      id: product.id,
      title: product.title,
      image: product.image ?? null,
      price: product.price ?? null,
      currency: product.currency ?? null,
      sourceUrl: product.sourceUrl ?? null,
      category: product.category ? { id: product.category.id, title: product.category.title, slug: product.category.slug } : null,
      detail: detail
        ? {
            description: detail.description ?? null,
            ratingAverage: detail.ratingAverage ?? null,
            lastScrapedAt: detail.lastScrapedAt ?? null,
            specs: detail.specs ?? null,
          }
        : null,
    };

    return out;
  }

  /** Force refresh (await the scrape), then return the newest data */
  async forceRefresh(id: string) {
    if (!id) throw new NotFoundException('Product not found');

    await this.scraper.refreshProduct(id).catch((err) => {
      this.log.warn(`forceRefresh scrape failed for ${id}: ${err instanceof Error ? err.message : String(err)}`);
    });

    const product = await this.products.findOne({ where: { id }, relations: { category: true } });
    if (!product) throw new NotFoundException('Product not found');

    const detail =
      (await this.details.findOne({
        where: { product: { id } },
        // relations: { product: true }, // ⛔️ prevent circular
      })) || null;

    return {
      id: product.id,
      title: product.title,
      image: product.image ?? null,
      price: product.price ?? null,
      currency: product.currency ?? null,
      sourceUrl: product.sourceUrl ?? null,
      category: product.category ? { id: product.category.id, title: product.category.title, slug: product.category.slug } : null,
      detail: detail
        ? {
            description: detail.description ?? null,
            ratingAverage: detail.ratingAverage ?? null,
            lastScrapedAt: detail.lastScrapedAt ?? null,
            specs: detail.specs ?? null,
          }
        : null,
    };
  }
}
