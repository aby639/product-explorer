// backend/src/products/products.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';

import { Product } from '../entities/product.entity';
import { Category } from '../entities/category.entity';

export type ListOptions = {
  category?: string; // uuid | slug | title | comma-separated
  page?: number;
  limit?: number;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(v: string) {
  return UUID_RE.test(v);
}

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(Category) private readonly categories: Repository<Category>,
  ) {}

  async list(opts: ListOptions) {
    const page = Math.max(1, Number(opts.page ?? 1));
    const limit = Math.max(1, Math.min(48, Number(opts.limit ?? 12)));

    // ---- resolve category -> array of category IDs ----
    let categoryIds: string[] | undefined;

    if (opts.category) {
      const tokens = String(opts.category)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const resolvedIds: string[] = [];

      // keep all UUIDs as-is
      for (const t of tokens) if (isUuid(t)) resolvedIds.push(t);

      // the rest are slugs or titles
      const nonUuids = tokens.filter((t) => !isUuid(t));
      if (nonUuids.length) {
        // slug matches
        const slugMatches = await this.categories.find({
          where: nonUuids.map((s) => ({ slug: s })),
          select: ['id'],
        });

        const matchedIds = new Set(slugMatches.map((c) => c.id));
        const remaining = nonUuids.filter((t) => !matchedIds.has(t));

        // title matches (case-insensitive)
        let titleMatches: Category[] = [];
        if (remaining.length) {
          titleMatches = await this.categories.find({
            // IMPORTANT: use 'title' (your entity field), not 'name'
            where: remaining.map((t) => ({ title: ILike(t) })),
            select: ['id'],
          });
        }

        resolvedIds.push(
          ...slugMatches.map((c) => c.id),
          ...titleMatches.map((c) => c.id),
        );
      }

      if (resolvedIds.length) categoryIds = Array.from(new Set(resolvedIds));
    }

    // ---- query products ----
    const qb = this.products
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.category', 'c')
      .skip((page - 1) * limit)
      .take(limit)
      .orderBy('p.title', 'ASC');

    if (categoryIds?.length) {
      qb.andWhere('c.id IN (:...categoryIds)', { categoryIds });
    }

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }

  async findOne(id: string) {
    return this.products.findOne({
      where: { id },
      relations: { detail: true },
    });
  }
}
