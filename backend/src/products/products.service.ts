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

  async list(params: { category?: string; page?: number; limit?: number }) {
    const page = Math.max(1, Number(params.page ?? 1));
    const take = Math.min(24, Math.max(1, Number(params.limit ?? 12)));
    const skip = (page - 1) * take;

    const [items, total] = await this.products.findAndCount({
      where: params.category ? ({ category: { slug: params.category } } as any) : {},
      order: { title: 'ASC' },
      take,
      skip,
    });

    return { items, total, page, pageSize: take };
  }

  /** GET /products/:id?refresh=true */
  async getOne(id: string, refresh?: boolean) {
    const product = await this.products.findOne({ where: { id }, relations: { category: true } });
    if (!product) throw new NotFoundException('Product not found');

    if (refresh) {
      this.scraper.refreshProduct(id).catch((err) => {
        this.log.warn(`refreshProduct failed for ${id}: ${String(err?.message ?? err)}`);
      });
    }

    const detail = await this.details.findOne({ where: { product: { id } } });

    // Return a flat object the frontend expects
    return { ...product, detail: detail ?? null };
  }

  /** POST /products/:id/refresh */
  async forceRefresh(id: string) {
    await this.scraper.refreshProduct(id).catch((err) => {
      this.log.warn(`forceRefresh scrape failed for ${id}: ${String(err?.message ?? err)}`);
    });

    const product = await this.products.findOne({ where: { id }, relations: { category: true } });
    if (!product) throw new NotFoundException('Product not found');

    const detail = await this.details.findOne({ where: { product: { id } } });
    return { ...product, detail: detail ?? null };
  }
}
