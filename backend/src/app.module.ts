import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { ENTITIES } from './entities';

import { NavigationModule } from './navigation/navigation.module';
import { CategoriesModule } from './categories/categories.module';
import { ProductsModule } from './products/products.module';

import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ViewsModule } from './views/views.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: ENTITIES,   // single source of truth
      synchronize: true,    // dev only
      logging: false,
    }),

    // Light rate limiting (per IP): 120 requests per minute
    ThrottlerModule.forRoot([{ ttl: 60, limit: 120 }]),

    // Feature modules
    NavigationModule,
    CategoriesModule,
    ProductsModule,
    ViewsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
