// backend/src/products/products.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../entities/product.entity';
import { ProductDetail } from '../entities/product-detail.entity';
import { ListProductsQueryDto } from './dto/get-products.dto';
import { ScraperService } from '../scraper/scraper.service';

function isUuid(v?: string): boolean {
  // strict UUID v4/any version check
  return !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(ProductDetail) private readonly details: Repository<ProductDetail>,
    private readonly scraper: ScraperService,
  ) {}

  async list({ page = 1, limit = 12, category }: ListProductsQueryDto) {
    const skip = (page - 1) * limit;

    let where:
      | undefined
      | Array<{
          category: { id?: string; slug?: string };
        }>;

    if (category) {
      if (isUuid(category)) {
        // query only by UUID
        where = [{ category: { id: category } as any }];
      } else {
        // query only by slug
        where = [{ category: { slug: category } as any }];
      }
    }

    const [items, total] = await this.products.findAndCount({
      where,
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
    await this.scraper.refreshProduct(id);
    const product = await this.products.findOne({
      where: { id },
      relations: { detail: true, category: true },
    });
    if (!product) throw new NotFoundException('Product not found after refresh');
    return product;
  }
}
