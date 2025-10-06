import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { ListProductsQueryDto } from './dto/get-products.dto';

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  /** List products (?category=fiction|non-fiction or UUID, ?page, ?limit) */
  @Get()
  async list(@Query() q: ListProductsQueryDto) {
    return this.products.list(q);
  }

  /** Get one product by id. If ?refresh=true is passed, trigger a scrape first. */
  @Get(':id')
  async getOne(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query('refresh') refresh?: string,
  ) {
    const force = String(refresh).toLowerCase() === 'true';
    return this.products.getOneSafe(id, { refresh: force });
  }
}
