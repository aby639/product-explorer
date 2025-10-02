import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ListProductsQueryDto } from './dto/get-products.dto';

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(@Query() q: ListProductsQueryDto) {
    return this.products.list(q);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.products.detail(id);
  }

  @Post(':id/refresh')
  refresh(@Param('id') id: string) {
    return this.products.refresh(id);
  }
}
