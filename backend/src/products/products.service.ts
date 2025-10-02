// src/products/products.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../entities/product.entity';
import { ListProductsQueryDto } from './products.dto';

@Injectable()
export class ProductsService {
  constructor(@InjectRepository(Product) private readonly repo: Repository<Product>) {}

  async list(q: ListProductsQueryDto) {
    const limit = Math.max(1, Math.min(50, Number(q.limit ?? 12)));
    const page = Math.max(1, Number(q.page ?? 1));
    const skip = (page - 1) * limit;

    const where = q.category ? { category: q.category } : {};
    const [items, total] = await this.repo.findAndCount({
      where,
      order: { title: 'ASC' },
      take: limit,
      skip,
    });

    return {
      items,
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
    };
  }
}
