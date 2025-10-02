// src/products/products.controller.ts
import { Controller, Get, Param, Query, Post } from '@nestjs/common';
import { ProductsService } from './products.service';

@Controller()
export class ProductsController {
  constructor(private readonly svc: ProductsService) {}

  // ===== LIST PRODUCTS (query-based) =====
  // GET /products?category=fiction&page=1&limit=12
  @Get('products')
  list(
    @Query('category') category?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.list({
      category: category || undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  // ===== OPTIONAL PATH ALIAS =====
  // GET /categories/:slug/products?page=1&limit=12
  @Get('categories/:slug/products')
  listByCategoryPath(
    @Param('slug') slug: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.list({
      category: slug,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  // ===== SINGLE PRODUCT + OPTIONAL BACKGROUND REFRESH =====
  // GET /products/:id?refresh=1
  @Get('products/:id')
  getOne(@Param('id') id: string, @Query('refresh') refresh?: string) {
    return this.svc.getOne(id, refresh === '1' || refresh === 'true');
  }

  // ===== FORCE REFRESH (blocking) =====
  // POST /products/:id/refresh
  @Post('products/:id/refresh')
  refresh(@Param('id') id: string) {
    return this.svc.forceRefresh(id);
  }
}
