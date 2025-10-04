import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, In } from 'typeorm';
import { Product } from '../entities/product.entity';
import { Category } from '../entities/category.entity';
import { ProductDetail } from '../entities/product-detail.entity';
import { ScraperService } from '../scraper/scraper.service';
import { ListProductsQueryDto } from './dto/get-products.dto';

const uuidV4Rx = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(Category) private readonly categories: Repository<Category>,
    @InjectRepository(ProductDetail) private readonly details: Repository<ProductDetail>,
    private readonly scraper: ScraperService,
  ) {}

  /** Accepts category as UUID or human slug/name (“fiction”, “non-fiction”) */
  async list(q: ListProductsQueryDto) {
    const page = Math.max(1, Number(q.page ?? 1));
    const limit = Math.min(50, Math.max(1, Number(q.limit ?? 12)));

    let categoryIds: string[] | undefined;

    if (q.category) {
      if (uuidV4Rx.test(q.category)) {
        categoryIds = [q.category];
      } else {
        // human-friendly: match by slug OR case-insensitive name
        const cats = await this.categories.find({
          where: [
            { slug: q.category },
            { name: ILike(q.category) },
            { slug: q.category.toLowerCase() },
          ],
          take: 10,
        });
        categoryIds = cats.map((c) => c.id);
        // if still nothing, try “books” subtree fuzzy match
        if (!categoryIds.length) {
          const candidates = await this.categories.find({
            where: [{ name: ILike('%' + q.category + '%') }],
            take: 10,
          });
          categoryIds = candidates.map((c) => c.id);
        }
      }
    }

    const [items, total] = await this.products.findAndCount({
      where: categoryIds?.length ? { category: { id: In(categoryIds) } } : {},
      relations: { category: true },
      order: { createdAt: 'ASC' },
      take: limit,
      skip: (page - 1) * limit,
      select: {
        id: true,
        title: true,
        image: true,
        price: true,
        currency: true,
        category: { id: true, name: true, slug: true },
      },
    });

    return { items, total, page, limit };
  }

  /** Get product + detail; optionally refresh before returning. Never throw on scraping. */
  async getOneSafe(id: string, opts?: { refresh?: boolean }) {
    // ensure entity exists
    const found = await this.products.findOne({
      where: { id },
      relations: { category: true, detail: true },
    });
    if (!found) throw new NotFoundException('Product not found');

    if (opts?.refresh) {
      try {
        await this.scraper.refreshProduct(id);
      } catch {
        // ignore scrape errors; still return the best data we have
      }
    }

    const withDetail = await this.products.findOne({
      where: { id },
      relations: { category: true, detail: true },
      select: {
        id: true,
        title: true,
        image: true,
        price: true,
        currency: true,
        category: { id: true, name: true, slug: true },
        detail: {
          id: true,
          description: true,
          ratingAverage: true,
          specs: true,
          lastScrapedAt: true,
        },
      },
    });

    return withDetail!;
  }
}
