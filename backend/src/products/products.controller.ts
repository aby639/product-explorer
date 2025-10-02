import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ListProductsQueryDto } from './dto/get-products.dto';

@Controller('products')
export class ProductsController {
  constructor(private readonly svc: ProductsService) {}

  @Get()
  async list(@Query() q: ListProductsQueryDto) {
    return this.svc.list(q);
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    return this.svc.detail(id);
  }

  @Post(':id/refresh')
  async refresh(@Param('id') id: string) {
    return this.svc.refreshProduct(id);
  }
}
