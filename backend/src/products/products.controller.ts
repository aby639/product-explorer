import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  NotFoundException,
  Post,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { ListProductsQueryDto } from './dto/get-products.dto';

@Controller('products')
export class ProductsController {
  constructor(private readonly svc: ProductsService) {}

  @Get()
  async list(@Query() q: ListProductsQueryDto) {
    return this.svc.list(q);
  }

  // IMPORTANT: this route is what your product page calls
  @Get(':id')
  async getOne(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query('refresh') refresh?: 'true' | 'false',
  ) {
    const data = await this.svc.getOne(id, refresh === 'true');
    if (!data) throw new NotFoundException('Product not found');
    return data;
  }

  // Optional – keeps your “Force refresh” button snappy if you still call POST
  @Post(':id/refresh')
  async refresh(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.svc.refresh(id);
  }
}
