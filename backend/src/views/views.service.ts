import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ViewHistory } from '../entities/view-history.entity';
import { CreateViewDto } from './dto/create-view.dto';

@Injectable()
export class ViewsService {
  constructor(@InjectRepository(ViewHistory) private readonly repo: Repository<ViewHistory>) {}

  async create(dto: CreateViewDto) {
    const sessionId = dto.sessionId?.trim();
    const path = (dto.path ?? '/').toString();

    if (!sessionId) throw new BadRequestException('sessionId required');

    let row = await this.repo.findOne({ where: { sessionId } });
    if (!row) {
      row = this.repo.create({ sessionId, pathJson: [path] });
    } else {
      row.pathJson = [...(row.pathJson ?? []), path];
    }
    await this.repo.save(row);
    return { ok: true };
  }
}
