import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  In,
  Brackets,
} from 'typeorm';
import { Product } from '../entities/product.entity';
import { ProductDetail } from '../entities/product-detail.entity';
import { Category } from '../entities/category.entity';
import { ListProductsQueryDto } from './dto/get-products.dto';
import { ScraperService } from '../scraper/scraper.service';

// simple UUID v4 test
const isUuid = (s?: string) => !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(ProductDetail) private readonly details: Repository<ProductDetail>,
    @InjectRepository(Category) private readonly categories: Repository<Category>,
    private readonly scraper: ScraperService,
  ) {}

  /** Resolve “category” which may be UUID, slug, or name -> array of category IDs */
  private async resolveCategoryIds(input?: string): Promise<string[] | null> {
    if (!input) return null;
    if (isUuid(input)) return [input];

    // Try slug match first, then case-insensitive name
    const candidates = await this.categories
      .createQueryBuilder('c')
      .where('LOWER(c.slug) = LOWER(:q)', { q: input })
      .orWhere('LOWER(c.name) = LOWER(:q)', { q: input })
      .getMany();

    return candidates.length ? candidates.map((c) => c.id) : [];
  }

  async list({ page = 1, limit = 12, category }: ListProductsQueryDto) {
    const qb = this.products
      .createQueryBuilder('p')
      .leftJoin('p.categories', 'c')
      .leftJoinAndSelect('p.detail', 'd')
      .orderBy('p.title', 'ASC');

    if (category) {
      const ids = await this.resolveCategoryIds(category);
      if (ids && ids.length) {
        qb.andWhere('c.id IN (:...catIds)', { catIds: ids });
      } else if (isUuid(category)) {
        qb.andWhere('c.id = :cid', { cid: category });
      } else {
        // No match -> return empty page
        return { items: [], total: 0, page, limit };
      }
    }

    qb.skip((page - 1) * limit).take(limit);

    const [items, total] = await qb.getManyAndCount();

    // trim response a little
    const lean = items.map((p) => ({
      id: p.id,
      title: p.title,
      image: p.image ?? null,
      price: p.price ?? null,
      currency: p.currency ?? null,
    }));

    return { items: lean, total, page, limit };
  }

  async getOne(id: string, refresh = false) {
    let product = await this.products.findOne({
      where: { id },
      relations: { detail: true },
    });

    if (!product) return null;

    // Refresh (scrape) if asked
    if (refresh) {
      await this.scraper.refreshProduct(product.id).catch(() => undefined);
      product = await this.products.findOne({
        where: { id },
        relations: { detail: true },
      });
    }

    return {
      id: product.id,
      title: product.title,
      image: product.image ?? null,
      price: product.price ?? null,
      currency: product.currency ?? null,
      detail: product.detail
        ? {
            description: product.detail.description ?? null,
            url: product.sourceUrl ?? null,
            lastScrapedAt: product.detail.lastScrapedAt ?? null,
          }
        : null,
    };
  }

  async refresh(id: string) {
    await this.scraper.refreshProduct(id);
    return this.getOne(id, false);
  }
}
