import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductDetail } from '../entities/product-detail.entity';
import { Product } from '../entities/product.entity';
import { ScraperService } from './scraper.service';

@Module({
  imports: [TypeOrmModule.forFeature([ProductDetail, Product])],
  providers: [ScraperService],
  exports: [ScraperService],
})
export class ScraperModule {}
