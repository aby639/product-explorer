import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Navigation } from '../entities/navigation.entity';

@Injectable()
export class NavigationService implements OnModuleInit {
  constructor(@InjectRepository(Navigation) private repo: Repository<Navigation>) {}

  // Seed once when the service boots (production DBs often start empty)
  async onModuleInit() {
    await this.ensureSeed();
  }

  async ensureSeed() {
    const count = await this.repo.count();
    if (count > 0) return;

    // Adjust field names to match your entity (key/navKey, title, href, etc.)
    const rows: Partial<Navigation>[] = [
      { key: 'books', title: 'Books' },
      // add more if you have them (e.g. { key: 'games', title: 'Games' })
    ];

    await this.repo.save(rows as Navigation[]);
  }

  findAll() {
    return this.repo.find({ order: { title: 'ASC' } });
  }
}

