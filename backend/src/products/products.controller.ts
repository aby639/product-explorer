import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Post,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { ListProductsQueryDto } from './dto/get-products.dto';

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Post(':id/refresh')
  refresh(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.products.getOneSafe(id, { refresh: true });
  }

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
    const force = ['true', '1'].includes(String(refresh).toLowerCase());
    return this.products.getOneSafe(id, { refresh: force });
  }
}
