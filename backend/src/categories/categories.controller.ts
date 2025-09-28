import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { isUUID } from 'class-validator';
import { Category } from '../entities/category.entity';
import { Navigation } from '../entities/navigation.entity';

@Controller('categories')
export class CategoriesController {
  constructor(
    @InjectRepository(Category) private readonly categories: Repository<Category>,
    @InjectRepository(Navigation) private readonly navs: Repository<Navigation>,
  ) {}

  // Accept either a navigation UUID id or a slug like "books"
  @Get(':navKey')
  async list(@Param('navKey') navKey: string) {
    const navWhere = isUUID(navKey) ? { id: navKey } : { slug: navKey };
    const nav = await this.navs.findOne({ where: navWhere });
    if (!nav) throw new NotFoundException('Navigation not found');

    return this.categories.find({
      where: { navigation: { id: nav.id } },
      order: { title: 'ASC' },
    });
  }
}
