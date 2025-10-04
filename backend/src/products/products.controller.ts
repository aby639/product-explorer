import { Controller, Get, Query } from '@nestjs/common';
import { ProductsService } from './products.service';

class ListQuery {
  category?: string; // uuid | slug | comma-separated
  page?: string | number;
  limit?: string | number;
}

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  async list(@Query() q: ListQuery) {
    // normalize numbers
    const page = q.page != null ? Number(q.page) : undefined;
    const limit = q.limit != null ? Number(q.limit) : undefined;

    return this.products.list({
      category: q.category,
      page,
      limit,
    });
  }

  @Get(':id')
  async getOne(@Query() _q: any) {
    // This route is actually defined in another controller in your repo (products.controller.ts),
    // but keeping here in case you’ve co-located. If you already have /products/:id, keep that file.
    return { ok: true };
  }
}
