import { Controller, Get, Query, UsePipes, ValidationPipe } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ListProductsQueryDto } from './dto/get-products.dto';

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async list(@Query() q: ListProductsQueryDto) {
    return this.products.list({
      category: q.category,
      page: q.page,
      limit: q.limit,
    });
  }
}
