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

  async create(body: CreateViewDto) {
    const row = this.repo.create({
      sessionId: body.sessionId,
      pathJson: body.pathJson.slice(0, 20),
    });
    return this.repo.save(row);
  }
}
