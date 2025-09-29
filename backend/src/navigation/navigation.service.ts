import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Navigation } from '../entities/navigation.entity';
import { Category } from '../entities/category.entity';
import { Product } from '../entities/product.entity';

@Injectable()
export class NavigationService implements OnModuleInit {
  constructor(
    @InjectRepository(Navigation) private navRepo: Repository<Navigation>,
    @InjectRepository(Category)   private catRepo: Repository<Category>,
    @InjectRepository(Product)    private prodRepo: Repository<Product>,
  ) {}

  // auto-seed on cold start (idempotent)
  async onModuleInit() {
    await this.ensureSeed();
  }

  async ensureSeed() {
    // 1) NAV "books"
    let books = await this.navRepo.findOne({ where: { slug: 'books' } });
    if (!books) {
      books = this.navRepo.create({ slug: 'books', title: 'Books' });
      await this.navRepo.save(books);
    }

    // 2) CATEGORIES under "books"
    const defs = [
      { slug: 'fiction',     title: 'Fiction' },
      { slug: 'non-fiction', title: 'Non-fiction' },
    ];
    for (const d of defs) {
      let cat = await this.catRepo.findOne({ where: { slug: d.slug } });
      if (!cat) {
        cat = this.catRepo.create({ ...d, navigation: books });
        await this.catRepo.save(cat);
      }
    }

    const fiction    = await this.catRepo.findOneByOrFail({ slug: 'fiction' });
    const nonfiction = await this.catRepo.findOneByOrFail({ slug: 'non-fiction' });

    // 3) PRODUCTS (upsert by (title, category))
    const products: Array<Partial<Product>> = [
      {
        title: 'The Silent Patient',
        price: 6.99,
        currency: 'GBP',
        sourceUrl: 'https://www.worldofbooks.com/en-gb/products/silent-patient-book-alex-michaelides-9781250301697',
        category: fiction,
      },
      {
        title: 'Us Three',
        price: 4.99,
        currency: 'GBP',
        sourceUrl: 'https://www.worldofbooks.com/en-gb/products/us-three-book-ruth-jones-9781784162238',
        category: fiction,
      },
      {
        title: 'Atomic Habits',
        price: 7.99,
        currency: 'GBP',
        sourceUrl: 'https://www.worldofbooks.com/en-gb/products/atomic-habits-an-easy-proven-way-to-build-good-habits-and-break-bad-ones-book-9780593189641',
        category: nonfiction,
      },
      {
        title: 'Sapiens',
        price: 8.99,
        currency: 'GBP',
        sourceUrl: 'https://www.worldofbooks.com/en-gb/products/sapiens-book-yuval-noah-harari-9781784873646',
        category: nonfiction,
      },
      {
        title: 'Educated',
        price: 5.99,
        currency: 'GBP',
        sourceUrl: 'https://www.worldofbooks.com/en-gb/products/educated-book-tara-westover-9781786330512',
        category: nonfiction,
      },
    ];

    for (const p of products) {
      const existing = await this.prodRepo.findOne({
        where: { title: p.title!, category: { id: p.category!.id } },
        relations: { category: true },
      });

      if (!existing) {
        await this.prodRepo.save(this.prodRepo.create(p));
      } else {
        existing.sourceUrl = p.sourceUrl!;
        existing.price     = p.price!;
        existing.currency  = p.currency!;
        await this.prodRepo.save(existing);
      }
    }
  }

  findAll() {
    return this.navRepo.find({ order: { title: 'ASC' } });
  }
}
