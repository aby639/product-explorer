import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ViewHistory } from '../entities/view-history.entity';
import { ViewsService } from './views.service';
import { ViewsController } from './views.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ViewHistory])],
  providers: [ViewsService],
  controllers: [ViewsController],
})
export class ViewsModule {}
