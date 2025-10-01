import {
  Controller,
  Get,
  Param,
  Query,
  NotFoundException,
  Post,
  BadRequestException,
} from '@nestjs/common';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly svc: ProductsService) {}

  @Get()
  async list(
    @Query('category') categorySlug: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    const p = Number(page) || 1;
    const l = Number(limit) || 20;
    return this.svc.findByCategorySlug(categorySlug, p, l);
  }

  @Get(':id')
  async getOne(
    @Param('id') id: string,
    @Query('refresh') refresh?: string,
  ) {
    const doRefresh = refresh === 'true';
    const product = await this.svc.findOneAndMaybeRefresh(id, doRefresh);
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  // convenience endpoint if you want a POST refresh
  @Post(':id/refresh')
  async force(@Param('id') id: string) {
    const product = await this.svc.findOneAndMaybeRefresh(id, true);
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  // ---- TEMP: POST /products/seed  (guarded with env var) ----
  @Post('seed')
  async seed(@Query('key') key?: string) {
    if (process.env.SEED_ENABLED !== '1') {
      throw new NotFoundException();
    }
    if (process.env.SEED_KEY && key !== process.env.SEED_KEY) {
      throw new BadRequestException('Bad key');
    }
    return this.svc.ensureSeedProducts();
  }
}
