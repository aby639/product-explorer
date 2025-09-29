import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Navigation } from '../entities/navigation.entity';

@Injectable()
export class NavigationService implements OnModuleInit {
  constructor(@InjectRepository(Navigation) private repo: Repository<Navigation>) {}

  async onModuleInit() {
    await this.ensureSeed();
  }

  async ensureSeed() {
    const count = await this.repo.count();
    if (count > 0) return;

    // Use column names from your entity (slug + title)
    const rows: Partial<Navigation>[] = [{ slug: 'books', title: 'Books' }];

    await this.repo.save(rows as Navigation[]);
  }

  findAll() {
    return this.repo.find({ order: { title: 'ASC' } });
  }
}
