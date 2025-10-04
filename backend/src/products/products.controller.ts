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

  /** List products (?category=fiction|non-fiction|uuid, ?page, ?limit) */
  @Get()
  async list(@Query() q: ListProductsQueryDto) {
    return this.products.list(q);
  }

  /** Get one product. If ?refresh=true/1 is passed, scrape before returning. */
  @Get(':id')
  async getOne(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query('refresh') refresh?: string,
  ) {
    const force =
      typeof refresh === 'string' &&
      ['true', '1', 'yes'].includes(refresh.toLowerCase());
    return this.products.getOneSafe(id, { refresh: force });
  }
}
