import { Body, Controller, Post } from '@nestjs/common';
import { ViewsService } from './views.service';
import { CreateViewDto } from './dto/create-view.dto';

@Controller('views')
export class ViewsController {
  constructor(private readonly svc: ViewsService) {}

  @Post()
  create(@Body() body: CreateViewDto) {
    return this.svc.create(body);
  }
}
