import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Category } from '../entities/category.entity';
import { Navigation } from '../entities/navigation.entity';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';

@Module({
  imports: [TypeOrmModule.forFeature([Category, Navigation])],
  controllers: [CategoriesController],
  providers: [CategoriesService],
  exports: [TypeOrmModule],
})
export class CategoriesModule {}
