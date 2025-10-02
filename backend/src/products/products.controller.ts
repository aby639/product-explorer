import { Controller, Get, Param, Query, Post } from '@nestjs/common';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly svc: ProductsService) {}

  @Get(':id')
  getOne(
    @Param('id') id: string,
    @Query('refresh') refresh?: string,
  ) {
    return this.svc.getOne(id, refresh === '1' || refresh === 'true');
  }

  @Post(':id/refresh')
  refresh(@Param('id') id: string) {
    return this.svc.forceRefresh(id);
  }
}
