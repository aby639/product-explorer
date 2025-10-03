import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../entities/product.entity';
import { ProductDetail } from '../entities/product-detail.entity';
import { ListProductsQueryDto } from './dto/get-products.dto';
import { ScraperService } from '../scraper/scraper.service';

function looksLikeUuid(value?: string) {
  // Simple UUID v4-ish check; good enough for routing
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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

    // Build explicit QB so we can safely filter by slug OR id
    const qb = this.products
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.detail', 'detail')
      .leftJoinAndSelect('p.category', 'category')
      .orderBy('p.id', 'DESC') // stable ordering
      .skip(skip)
      .take(limit);

    if (category) {
      if (looksLikeUuid(category)) {
        qb.andWhere('p.categoryId = :catId', { catId: category });
      } else {
        qb.andWhere('category.slug = :slug', { slug: category });
      }
    }

    const [items, total] = await qb.getManyAndCount();
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
