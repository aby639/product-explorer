import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ViewHistory } from '../entities/view-history.entity';
import { CreateViewDto } from './dto/create-view.dto';

@Injectable()
export class ViewsService {
  constructor(
    @InjectRepository(ViewHistory)
    private readonly repo: Repository<ViewHistory>,
  ) {}

  async create(dto: CreateViewDto) {
    const vh = this.repo.create({
      sessionId: dto.sessionId,
      pathJson: dto.trail?.length ? dto.trail.concat(dto.path) : [dto.path],
    });
    return this.repo.save(vh);
  }
}
