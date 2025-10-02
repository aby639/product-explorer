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

  /** make http assets safe under https sites */
  private toHttps(u?: string | null): string | null {
    if (!u) return u ?? null;
    try {
      const url = new URL(u);
      if (url.protocol === 'http:') url.protocol = 'https:';
      return url.toString();
    } catch {
      return u;
    }
  }

  /** strip circular refs & normalize URLs */
  private sanitizeProduct(p: Product): Product {
    return {
      ...p,
      image: this.toHttps(p.image) as any,
      sourceUrl: this.toHttps(p.sourceUrl) as any,
    };
  }
  private sanitizeDetail(d: ProductDetail | null): ProductDetail | null {
    if (!d) return null;
    // Ensure no circular reference sneaks in
    // (if detail was previously saved with relation loaded)
    const { product: _drop, ...rest } = d as any;
    return {
      ...(rest as ProductDetail),
      // keep lastScrapedAt, description, ratingAverage, specs
    };
  }

  async list(params: { category?: string; page?: number; limit?: number }) {
    const page = Math.max(1, Number(params.page ?? 1));
    const take = Math.min(24, Math.max(1, Number(params.limit ?? 12)));
    const skip = (page - 1) * take;

    const [items, total] = await this.products.findAndCount({
      where: params.category ? { category: { slug: params.category } as any } : {},
      order: { title: 'ASC' },
      take,
      skip,
    });

    return {
      items: items.map((p) => this.sanitizeProduct(p)),
      total,
      page,
      limit: take,
    };
  }

  async getOne(id: string, refresh?: boolean) {
    const product = await this.products.findOne({
      where: { id },
      // relations: { category: true }, // not needed for this response
    });
    if (!product) throw new NotFoundException('Product not found');

    if (refresh) {
      // background refresh; don’t await to keep response snappy
      this.scraper.refreshProduct(id).catch(() => undefined);
    }

    const detailRaw =
      (await this.details.findOne({
        where: { product: { id } },
        // IMPORTANT: don't load relations here
        // relations: { product: true },
      })) || null;

    return {
      product: this.sanitizeProduct(product),
      detail: this.sanitizeDetail(detailRaw),
    };
  }

  async forceRefresh(id: string) {
    await this.scraper.refreshProduct(id).catch(() => undefined);

    const product = await this.products.findOne({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');

    const detailRaw =
      (await this.details.findOne({
        where: { product: { id } },
      })) || null;

    return {
      product: this.sanitizeProduct(product),
      detail: this.sanitizeDetail(detailRaw),
    };
  }
}
