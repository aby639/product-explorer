import { Controller, Get, Param, Post } from '@nestjs/common';
import { CategoriesService } from './categories.service';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly cats: CategoriesService) {}

  // Accepts nav UUID or slug, e.g. /categories/books
  @Get(':navKey')
  list(@Param('navKey') navKey: string) {
    return this.cats.listByNavKey(navKey);
  }

  // Optional: reseed quickly if the table was wiped
  @Post('refresh')
  async refresh() {
    await this.cats.ensureSeed();
    return this.cats.listByNavKey('books');
  }
}
