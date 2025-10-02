import { Controller, Get, Param, Query, Post } from '@nestjs/common';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly svc: ProductsService) {}

  // NEW: list endpoint used by the category pages
  @Get()
  list(
    @Query('category') category?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '12',
  ) {
    return this.svc.list({
      category: category || undefined,
      page: Number(page),
      limit: Number(limit),
    });
  }

  @Get(':id')
  getOne(
    @Param('id') id: string,
    @Query('refresh') refresh?: string,
  ) {
    // returns { product, detail }
    return this.svc.getOne(id, refresh === '1' || refresh === 'true');
  }

  @Post(':id/refresh')
  refresh(@Param('id') id: string) {
    return this.svc.forceRefresh(id);
  }
}
