import { Controller, Get, Param, ParseBoolPipe, Post, Query } from '@nestjs/common';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly svc: ProductsService) {}

  @Get()
  list(
    @Query('category') category?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.svc.list({ category, page: Number(page), limit: Number(limit) });
  }

  // GET /products/:id?refresh=true
  @Get(':id')
  getOne(
    @Param('id') id: string,
    @Query('refresh', new ParseBoolPipe({ optional: true })) refresh?: boolean,
  ) {
    return this.svc.getOne(id, !!refresh);
  }

  // POST /products/:id/refresh
  @Post(':id/refresh')
  forceRefresh(@Param('id') id: string) {
    return this.svc.forceRefresh(id);
  }
}
