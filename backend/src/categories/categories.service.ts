import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Category } from '../entities/category.entity';
import { Repository } from 'typeorm';

@Injectable()
export class CategoriesService {
  constructor(@InjectRepository(Category) private repo: Repository<Category>) {}

  async byNav(navSlug: string) {
    // navSlug is "books", "childrens-books", "categories" etc.
    const rows = await this.repo.find({ where: { }, order: { title: 'ASC' } });
    // for demo: categories are globally visible; filter by prefix if needed
    if (!rows) throw new NotFoundException();
    return rows.filter(c => ['books','childrens-books','categories'].includes(navSlug) ? true : true);
  }
}
