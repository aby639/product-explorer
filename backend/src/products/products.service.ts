import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../entities/product.entity';
import { ListProductsQueryDto } from './dto/get-products.dto';
import { ScraperService } from '../scraper/scraper.service';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product) private readonly repo: Repository<Product>,
    private readonly scraper: ScraperService,
  ) {}

  async list({ page = 1, limit = 12, category }: ListProductsQueryDto) {
    const skip = (page - 1) * limit;
    const [items, total] = await this.repo.findAndCount({
      where: category ? { category } : {},
      order: { updatedAt: 'DESC' },
      skip,
      take: limit,
    });
    return { items, total, page, limit };
  }

  async detail(id: string) {
    const product = await this.repo.findOne({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async refreshProduct(id: string) {
    const prod = await this.repo.findOne({ where: { id } });
    if (!prod) throw new NotFoundException('Product not found');

    const scraped = await this.scraper.scrapeProduct(prod.sourceUrl);
    // Merge + save
    Object.assign(prod, scraped, { updatedAt: new Date() });
    await this.repo.save(prod);
    return prod;
  }
}
