// backend/src/entities/index.ts

// Barrel exports
export * from './navigation.entity';
export * from './category.entity';
export * from './product.entity';
export * from './product-detail.entity';
export * from './review.entity';
export * from './view-history.entity';

// IMPORTANT: keep ENTITIES a concrete array of classes/schemas for TypeORM
import type { EntitySchema } from 'typeorm';
import { Navigation } from './navigation.entity';
import { Category } from './category.entity';
import { Product } from './product.entity';
import { ProductDetail } from './product-detail.entity';
import { Review } from './review.entity';
import { ViewHistory } from './view-history.entity';

export const ENTITIES: (Function | string | EntitySchema<any>)[] = [
  Navigation,
  Category,
  Product,
  ProductDetail,
  Review,
  ViewHistory,
];
