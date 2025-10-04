import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Like, Repository } from 'typeorm';

import { Product } from '../entities/product.entity';
import { Category } from '../entities/category.entity';

export type ListOptions = {
  // Accept UUID, slug, or comma-separated list of either
  category?: string;
  // pagination
  page?: number;
  limit?: number;
  // future: sorting, price range, etc.
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(v: string) {
  return UUID_RE.test(v);
}

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(Category) private readonly categories: Repository<Category>,
  ) {}

  /**
   * Returns products optionally filtered by category.
   * The `category` filter may be a UUID, a slug, a name, or a comma-separated list of any of those.
   */
  async list(opts: ListOptions) {
    const page = Math.max(1, Number(opts.page ?? 1));
    const limit = Math.max(1, Math.min(48, Number(opts.limit ?? 12)));

    // ---------- resolve category filters ----------
    let categoryIds: string[] | undefined;

    if (opts.category) {
      // support comma-separated values
      const tokens = String(opts.category)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const uuids = tokens.filter(isUuid);
      const nonUuids = tokens.filter((t) => !isUuid(t));

      // start with any UUIDs we already have
      const resolved: string[] = [...uuids];

      if (nonUuids.length) {
        // Try to resolve slugs OR titles case-insensitively
        // Note: we allow duplicates; In([...new Set(...)]) later de-dupes.
        const slugMatches = await this.categories.find({
          where: nonUuids.map((s) => ({ slug: s })),
          select: ['id'],
        });

        // If any token didn’t match slug, try a looser "name ILIKE"
        const remaining = new Set(
          nonUuids.filter((s) => !slugMatches.some((c) => c.id === s)),
        );

        let nameMatches: Category[] = [];
        if (remaining.size) {
          // “fiction” or “non-fiction”
          nameMatches = await this.categories.find({
            where: Array.from(remaining).map((t) => ({ name: Like(t) })),
            select: ['id'],
          });
        }

        resolved.push(...slugMatches.map((c) => c.id), ...nameMatches.map((c) => c.id));
      }

      // if we resolved at least one id, use them; otherwise leave undefined (no filter)
      if (resolved.length) {
        categoryIds = Array.from(new Set(resolved));
      }
    }

    // ---------- query ----------
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

    return {
      items,
      total,
      page,
      limit,
    };
  }

  async findOne(id: string) {
    return this.products.findOne({
      where: { id },
      relations: { detail: true },
    });
  }
}
