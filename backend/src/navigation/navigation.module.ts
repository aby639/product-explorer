import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Navigation } from '../entities/navigation.entity';
import { Category } from '../entities/category.entity';
import { Product } from '../entities/product.entity';

import { NavigationController } from './navigation.controller';
import { NavigationService } from './navigation.service';

@Module({
  // include all repos we need for seeding
  imports: [TypeOrmModule.forFeature([Navigation, Category, Product])],
  controllers: [NavigationController],
  providers: [NavigationService],
  exports: [TypeOrmModule, NavigationService],
})
export class NavigationModule {}
