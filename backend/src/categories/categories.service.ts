import { Injectable, OnModuleInit, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from '../entities/category.entity';
import { Navigation } from '../entities/navigation.entity';
import { isUUID } from 'class-validator';

@Injectable()
export class CategoriesService implements OnModuleInit {
  constructor(
    @InjectRepository(Category) private readonly categories: Repository<Category>,
    @InjectRepository(Navigation) private readonly navs: Repository<Navigation>,
  ) {}

  async onModuleInit() {
    await this.ensureSeed();
  }

  /** Seed minimal categories under the "books" nav if DB is empty (idempotent). */
  async ensureSeed() {
    // ensure "books" navigation row exists
    let books = await this.navs.findOne({ where: { slug: 'books' } });
    if (!books) {
      books = this.navs.create({ slug: 'books', title: 'Books' });
      await this.navs.save(books);
    }

    const count = await this.categories.count({
      where: { navigation: { id: books.id } },
      relations: { navigation: true },
    });
    if (count > 0) return;

    const rows: Array<Partial<Category>> = [
      { slug: 'fiction',     title: 'Fiction',     navigation: books },
      { slug: 'non-fiction', title: 'Non-fiction', navigation: books },
    ];
    await this.categories.save(rows as Category[]);
  }

  /** Resolve a nav by slug or UUID and return its categories (sorted). */
  async listByNavKey(navKey: string) {
    const where = isUUID(navKey) ? { id: navKey } : { slug: navKey };
    const nav = await this.navs.findOne({ where });
    if (!nav) throw new NotFoundException('Navigation not found');

    return this.categories.find({
      where: { navigation: { id: nav.id } },
      order: { title: 'ASC' },
    });
  }
}
