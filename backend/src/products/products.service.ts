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

  /** small helper: ensure browser-safe https URLs for images & external links */
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

    // normalise URLs so images/links work under HTTPS
    const itemsNorm = items.map((p) => ({
      ...p,
      image: this.toHttps(p.image),
      sourceUrl: this.toHttps(p.sourceUrl),
    }));

    // NOTE: return 'limit' (not 'pageSize') to match the frontend
    return { items: itemsNorm, total, page, limit: take };
  }

  async getOne(id: string, refresh?: boolean) {
    const product = await this.products.findOne({
      where: { id },
      relations: { category: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    // fire-and-forget background refresh if requested
    if (refresh) {
      this.scraper.refreshProduct(id).catch(() => undefined);
    }

    const detail =
      (await this.details.findOne({
        where: { product: { id } },
        relations: { product: true },
      })) || null;

    // normalise URLs
    product.image = this.toHttps(product.image) as any;
    product.sourceUrl = this.toHttps(product.sourceUrl) as any;

    return { product, detail };
  }

  async forceRefresh(id: string) {
    await this.scraper.refreshProduct(id).catch(() => undefined);

    const product = await this.products.findOne({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');

    const detail =
      (await this.details.findOne({
        where: { product: { id } },
        relations: { product: true },
      })) || null;

    // normalise URLs
    product.image = this.toHttps(product.image) as any;
    product.sourceUrl = this.toHttps(product.sourceUrl) as any;

    return { product, detail };
  }
}
