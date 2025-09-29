import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Navigation } from '../entities/navigation.entity';
import { NavigationController } from './navigation.controller';
import { NavigationService } from './navigation.service';

@Module({
  imports: [TypeOrmModule.forFeature([Navigation])],
  controllers: [NavigationController],
  providers: [NavigationService],                 // <-- register it
  exports: [TypeOrmModule, NavigationService],    // optional, handy elsewhere
})
export class NavigationModule {}
