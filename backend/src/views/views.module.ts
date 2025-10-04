import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ViewHistory } from '../entities/view-history.entity';
import { ViewsService } from './views.service';
import { ViewsController } from './views.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ViewHistory])],
  controllers: [ViewsController],
  providers: [ViewsService],
})
export class ViewsModule {}
