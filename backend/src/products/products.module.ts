// src/products/products.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { Product } from '../entities/product.entity';
import { ProductDetail } from '../entities/product-detail.entity';
import { Category } from '../entities/category.entity';
import { ScraperModule } from '../scraper/scraper.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product, ProductDetail, Category]),
    ScraperModule,
  ],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
