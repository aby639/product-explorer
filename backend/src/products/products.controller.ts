import { Controller, Get, Param, Query, Post } from '@nestjs/common';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly svc: ProductsService) {}

  /** Grid list: /products?category=fiction&page=1&limit=12 */
  @Get()
  list(
    @Query('category') category?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.list({
      category: category || undefined,
      page: page != null ? Number(page) : undefined,
      limit: limit != null ? Number(limit) : undefined,
    });
  }

  /** Details (optionally background refresh): /products/:id?refresh=true */
  @Get(':id')
  getOne(@Param('id') id: string, @Query('refresh') refresh?: string) {
    const doRefresh = refresh === '1' || refresh === 'true';
    return this.svc.getOne(id, doRefresh);
  }

  /** Force refresh now */
  @Post(':id/refresh')
  refresh(@Param('id') id: string) {
    return this.svc.forceRefresh(id);
  }
}
