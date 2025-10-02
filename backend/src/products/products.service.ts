import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../entities/product.entity';
import { ProductDetail } from '../entities/product-detail.entity';
import { ListProductsQueryDto } from './dto/get-products.dto';
import { ScraperService } from '../scraper/scraper.service';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(ProductDetail) private readonly details: Repository<ProductDetail>,
    private readonly scraper: ScraperService,
  ) {}

  async list({ page = 1, limit = 12, category }: ListProductsQueryDto) {
    const skip = (page - 1) * limit;
    const [items, total] = await this.products.findAndCount({
      where: category ? { category: { id: category } as any } : {},
      order: { id: 'DESC' },
      skip,
      take: limit,
      relations: { detail: true, category: true },
      loadRelationIds: false,
    });

    return { items, total, page, limit };
  }

  async detail(id: string) {
    const product = await this.products.findOne({
      where: { id },
      relations: { detail: true, category: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async refresh(id: string) {
    // delegate to your ScraperService (you already wrote this)
    const detail = await this.scraper.refreshProduct(id);
    // return the updated product with detail
    const product = await this.products.findOne({
      where: { id },
      relations: { detail: true, category: true },
    });
    if (!product) throw new NotFoundException('Product not found after refresh');
    return product;
  }
}
