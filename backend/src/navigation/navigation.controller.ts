import { Controller, Get } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Navigation } from '../entities/navigation.entity';

@Controller('navigation')
export class NavigationController {
  constructor(@InjectRepository(Navigation) private readonly navRepo: Repository<Navigation>) {}

  @Get()
  async list() {
    return this.navRepo.find({ order: { title: 'ASC' } });
  }
}
