import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Navigation } from '../entities/navigation.entity';

@Injectable()
export class NavigationService implements OnModuleInit {
  constructor(@InjectRepository(Navigation) private repo: Repository<Navigation>) {}

  // Auto-seed once when the service boots (only if table is empty)
  async onModuleInit() {
    await this.ensureSeed();
  }

  async ensureSeed() {
    const count = await this.repo.count();
    if (count > 0) return;

    // 👇 use column names from your entity
    const rows: Partial<Navigation>[] = [
      { slug: 'books', title: 'Books' },   // <-- was navKey; must be slug
      // add more if you want, e.g.: { slug: 'games', title: 'Games' },
    ];

    await this.repo.save(rows as Navigation[]);
  }

  findAll() {
    return this.repo.find({ order: { title: 'ASC' } });
  }
}
