import { Controller, Get, Post } from '@nestjs/common';
import { NavigationService } from './navigation.service';

@Controller('navigation')
export class NavigationController {
  constructor(private readonly navService: NavigationService) {}

  @Get()
  list() {
    return this.navService.findAll();
  }

  // optional: call to re-seed if the table gets wiped
  @Post('refresh')
  async refresh() {
    await this.navService.ensureSeed();
    return this.navService.findAll();
  }
}
