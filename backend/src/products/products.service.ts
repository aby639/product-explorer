import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Product } from '../entities/product.entity';
import { ProductDetail } from '../entities/product-detail.entity';
import { Category } from '../entities/category.entity';
import { ScraperService } from '../scraper/scraper.service';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product) private readonly repo: Repository<Product>,
    @InjectRepository(ProductDetail) private readonly details: Repository<ProductDetail>,
    @InjectRepository(Category) private readonly cats: Repository<Category>,
    private readonly scraper: ScraperService,
  ) {}

  // simple “stale” check – 6 hours
  private isStale(dt?: Date | null): boolean {
    if (!dt) return true;
    const SIX_HOURS = 6 * 60 * 60 * 1000;
    return Date.now() - dt.getTime() > SIX_HOURS;
  }

  // GET /products?category=<slug>&page=&limit=
  async findByCategorySlug(categorySlug: string, page = 1, limit = 20) {
    const qb = this.repo
      .createQueryBuilder('p')
      .leftJoin('p.category', 'c')
      .leftJoinAndSelect('p.detail', 'detail')
      .where('c.slug = :slug', { slug: categorySlug })
      .orderBy('p.title', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, pageSize: limit };
  }

  // GET /products/:id?refresh=true
  async findOneAndMaybeRefresh(id: string, refresh = false) {
    let product = await this.repo.findOne({
      where: { id },
      relations: { detail: true },
    });
    if (!product) return null;

    // cooldown to avoid hammering the scraper during dev reloads
    const last = product.detail?.lastScrapedAt?.getTime?.() ?? 0;
    const COOLDOWN_MS = 30_000;

    const stale = this.isStale(product.detail?.lastScrapedAt ?? null);
    const allowNow = Date.now() - last > COOLDOWN_MS;

    if ((refresh || stale) && (allowNow || refresh)) {
      await this.scraper.refreshProduct(id).catch(() => undefined);
      product = await this.repo.findOne({
        where: { id },
        relations: { detail: true },
      });
    }
    return product;
  }
}
