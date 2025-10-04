import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ViewHistory } from '../entities/view-history.entity';
import { ViewsController } from './views.controller';
import { ViewsService } from './views.service';

@Module({
  imports: [TypeOrmModule.forFeature([ViewHistory])],
  controllers: [ViewsController],
  providers: [ViewsService],
  exports: [],
})
export class ViewsModule {}
