import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Navigation } from '../entities/navigation.entity';
import { Repository } from 'typeorm';

@Injectable()
export class NavigationService {
  constructor(@InjectRepository(Navigation) private repo: Repository<Navigation>) {}

  findAll() {
    return this.repo.find({ order: { title: 'ASC' } });
  }
}
