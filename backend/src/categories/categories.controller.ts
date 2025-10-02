// src/categories/categories.controller.ts
import { Controller, Get, Param, Post } from '@nestjs/common';
import { CategoriesService } from './categories.service';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly cats: CategoriesService) {}

  // GET /categories/books  -> [{ id, title, slug }, ...]
  @Get(':navKey')
  list(@Param('navKey') navKey: string) {
    return this.cats.listByNavKey(navKey);
  }

  // POST /categories/refresh  -> reseed from scratch (optional)
  @Post('refresh')
  async refresh() {
    await this.cats.ensureSeed();
    return this.cats.listByNavKey('books');
  }
}
