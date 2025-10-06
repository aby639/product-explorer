import {
  Controller,
  Get,
  Post,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { ListProductsQueryDto } from './dto/get-products.dto';
import { ScraperService } from '../scraper/scraper.service';

@Controller('products')
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly scraper: ScraperService, // <-- inject scraper
  ) {}

  /** List products (?category=fiction|non-fiction or UUID, ?page, ?limit) */
  @Get()
  async list(@Query() q: ListProductsQueryDto) {
    return this.products.list(q);
  }

  /**
   * Get one product by id.
   * If ?refresh=true is passed, we first run a blocking scrape so the response
   * contains the latest `detail.lastScrapedAt` and other fields.
   */
  @Get(':id')
  async getOne(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query('refresh') refresh?: string,
  ) {
    const force = (refresh ?? '').toLowerCase() === 'true';
    if (force) {
      await this.scraper.refreshProduct(id); // <-- wait until saved
    }
    return this.products.getOneSafe(id);
  }

  /**
   * Explicit refresh endpoint used by the frontend "Force refresh" button.
   * Blocks until the scrape is complete, then returns the fresh product.
   */
  @Post(':id/refresh')
  async refresh(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    await this.scraper.refreshProduct(id); // <-- triggers + waits
    return this.products.getOneSafe(id);   // <-- returns fresh detail
  }
}
