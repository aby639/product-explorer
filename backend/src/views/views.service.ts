import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ViewHistory } from '../entities';
import { CreateViewDto } from './dto/create-view.dto';

@Injectable()
export class ViewsService {
  constructor(
    @InjectRepository(ViewHistory)
    private readonly repo: Repository<ViewHistory>,
  ) {}

  async create(dto: CreateViewDto) {
    const row = this.repo.create({
      sessionId: dto.sessionId,
      pathJson: dto.path,
    });
    return this.repo.save(row);
  }
}
