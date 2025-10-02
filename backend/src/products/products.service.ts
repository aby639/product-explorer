// make sure you have something like this at the top:
import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Product } from '../entities/product.entity';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product) private readonly repo: Repository<Product>,
  ) {}

  async list(params: { page?: number; limit?: number; category?: string }) {
    // harden pagination
    const page = Number(params.page) || 1;
    const limit = Math.min(Math.max(Number(params.limit) || 12, 1), 50);
    const skip = (page - 1) * limit;

    const where = params.category ? { category: params.category } : {};

    const [items, total] = await this.repo.findAndCount({
      where,
      order: { updatedAt: 'DESC', id: 'ASC' },
      take: limit,
      skip,
    });

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }
}
