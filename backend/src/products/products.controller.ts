import { Controller, Get, Param, Query, Post } from '@nestjs/common';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly svc: ProductsService) {}

  // LIST: /products?category=fiction&page=1&limit=12
  @Get()
  list(
    @Query('category') category?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.list({
      category: category || undefined,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 12,
    });
  }

  // GET ONE: /products/:id?refresh=1
  @Get(':id')
  getOne(@Param('id') id: string, @Query('refresh') refresh?: string) {
    return this.svc.getOne(id, refresh === '1' || refresh === 'true');
  }

  // FORCE REFRESH: POST /products/:id/refresh
  @Post(':id/refresh')
  refresh(@Param('id') id: string) {
    return this.svc.forceRefresh(id);
  }
}
