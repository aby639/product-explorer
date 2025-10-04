import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, In } from 'typeorm';

import { Product } from '../entities/product.entity';
import { Category } from '../entities/category.entity';
import { ProductDetail } from '../entities/product-detail.entity';
import { ScraperService } from '../scraper/scraper.service';
import { ListProductsQueryDto } from './dto/get-products.dto';

/** Simple v4 UUID detector */
const uuidV4Rx =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly products: Repository<Product>,
    @InjectRepository(Category)
    private readonly categories: Repository<Category>,
    @InjectRepository(ProductDetail)
    private readonly details: Repository<ProductDetail>,
    private readonly scraper: ScraperService,
  ) {}

  /**
   * List products with pagination.
   * `q.category` may be a UUID, a slug ("fiction"), or a case-insensitive category title ("Fiction").
   */
  async list(q: ListProductsQueryDto) {
    const page = Math.max(1, Number(q.page ?? 1));
    const limit = Math.min(50, Math.max(1, Number(q.limit ?? 12)));

    let categoryIds: string[] | undefined;

    if (q.category) {
      if (uuidV4Rx.test(q.category)) {
        // Already a UUID
        categoryIds = [q.category];
      } else {
        // Try exact slug or exact title (case-insensitive)
        const exact = await this.categories.find({
          where: [
            { slug: q.category.toLowerCase() },
            { title: ILike(q.category) },
          ],
          take: 10,
        });
        categoryIds = exact.map((c) => c.id);

        // If nothing exact, try loose title match
        if (categoryIds.length === 0) {
          const loose = await this.categories.find({
            where: [{ title: ILike(`%${q.category}%`) }],
            take: 10,
          });
          categoryIds = loose.map((c) => c.id);
        }
      }
    }

    const [items, total] = await this.products.findAndCount({
      where: categoryIds?.length ? { category: { id: In(categoryIds) } } : {},
      relations: { category: true },
      // Product entity doesn't have createdAt; sort by id for stable paging
      order: { id: 'ASC' },
      take: limit,
      skip: (page - 1) * limit,
      // Only select what the client needs; be precise for TypeORM typing
      select: {
        id: true,
        title: true,
        image: true,
        price: true,
        currency: true,
        sourceUrl: true,
        category: { id: true, title: true, slug: true },
      },
    });

    return { items, total, page, limit };
  }

  /**
   * Get a single product (with detail). If `opts.refresh` is true,
   * trigger a scrape before returning. Scrape failures do not break the response.
   */
  async getOneSafe(id: string, opts?: { refresh?: boolean }) {
    // Ensure it exists (and capture basic relations)
    const exists = await this.products.findOne({
      where: { id },
      relations: { category: true, detail: true },
    });
    if (!exists) throw new NotFoundException('Product not found');

    // Optionally refresh (do not throw if scrape fails)
    if (opts?.refresh) {
      try {
        await this.scraper.refreshProduct(id);
      } catch {
        // ignore scrape errors; we still return the latest stored data
      }
    }

    // Return with precise select shape
    const withDetail = await this.products.findOne({
      where: { id },
      relations: { category: true, detail: true },
      select: {
        id: true,
        title: true,
        image: true,
        price: true,
        currency: true,
        sourceUrl: true,
        category: { id: true, title: true, slug: true },
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
