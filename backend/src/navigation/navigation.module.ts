import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Navigation } from '../entities/navigation.entity';
import { NavigationController } from './navigation.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Navigation])],
  controllers: [NavigationController],
})
export class NavigationModule {}
