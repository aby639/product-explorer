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

  private isStale(dt?: Date | null): boolean {
    if (!dt) return true;
    const SIX_HOURS = 6 * 60 * 60 * 1000;
    return Date.now() - dt.getTime() > SIX_HOURS;
  }

  // GET /products?category=<slug>&page=&limit=
  async findByCategorySlug(categorySlug: string, page = 1, limit = 20) {
    const cat = await this.cats.findOne({ where: { slug: categorySlug } });
    if (!cat) return { items: [], total: 0, page, pageSize: limit };

    const qb = this.repo
      .createQueryBuilder('p')
      .leftJoin('p.category', 'c')
      .leftJoinAndSelect('p.detail', 'detail')
      .where('c.id = :cid', { cid: cat.id })
      .orderBy('p.title', 'ASC') // ← keep simple, no SQL fn aliasing
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, pageSize: limit };
  }

  // GET /products/:id?refresh=true
  async findOneAndMaybeRefresh(id: string, refresh = false) {
    let product = await this.repo.findOne({ where: { id }, relations: { detail: true } });
    if (!product) return null;

    const last = product.detail?.lastScrapedAt?.getTime?.() ?? 0;
    const COOLDOWN_MS = 30_000;
    const stale = this.isStale(product.detail?.lastScrapedAt ?? null);
    const allowNow = Date.now() - last > COOLDOWN_MS;

    // If refresh=true, actually FORCE it (bypass stale check).
    if (refresh && (!product.detail?.lastScrapedAt || allowNow)) {
      await this.scraper.refreshProduct(id, true).catch(() => undefined);
      product = await this.repo.findOne({ where: { id }, relations: { detail: true } });
      return product;
    }

    // Otherwise scrape only when stale + out of cooldown.
    if (stale && allowNow) {
      await this.scraper.refreshProduct(id).catch(() => undefined);
      product = await this.repo.findOne({ where: { id }, relations: { detail: true } });
    }
    return product;
  }

  // POST /products/:id/refresh — hard refresh endpoint
  async forceRefresh(id: string) {
    await this.scraper.refreshProduct(id, true); // ← important
    return this.repo.findOne({ where: { id }, relations: { detail: true } });
  }

  // -------------------- temporary seed --------------------
  async ensureSeedProducts() {
    const existing = await this.repo.count();
    if (existing > 0) return { inserted: 0, skipped: existing };

    const fiction = await this.cats.findOne({ where: { slug: 'fiction' } });
    const nonfiction = await this.cats.findOne({ where: { slug: 'non-fiction' } });
    if (!fiction || !nonfiction) {
      throw new Error('Seed requires categories "fiction" and "non-fiction".');
    }

    const defs: Array<Partial<Product>> = [
      {
        title: 'The Silent Patient',
        price: 6.99,
        currency: 'GBP',
        sourceUrl:
          'https://www.worldofbooks.com/en-gb/products/silent-patient-book-alex-michaelides-9781250301697',
        category: fiction,
      },
      {
        title: 'Us Three',
        price: 4.99,
        currency: 'GBP',
        sourceUrl:
          'https://www.worldofbooks.com/en-gb/products/us-three-book-ruth-jones-9781784162238',
        category: fiction,
      },
      {
        title: 'Atomic Habits',
        price: 7.99,
        currency: 'GBP',
        sourceUrl:
          'https://www.worldofbooks.com/en-gb/products/atomic-habits-an-easy-proven-way-to-build-good-habits-and-break-bad-ones-book-9780593189641',
        category: nonfiction,
      },
      {
        title: 'Sapiens',
        price: 8.99,
        currency: 'GBP',
        sourceUrl:
          'https://www.worldofbooks.com/en-gb/products/sapiens-book-yuval-noah-harari-9781784873646',
        category: nonfiction,
      },
      {
        title: 'Educated',
        price: 5.99,
        currency: 'GBP',
        sourceUrl:
          'https://www.worldofbooks.com/en-gb/products/educated-book-tara-westover-9781786330512',
        category: nonfiction,
      },
    ];

    await this.repo.save(defs.map(d => this.repo.create(d)));
    return { inserted: defs.length, skipped: 0 };
  }
}
