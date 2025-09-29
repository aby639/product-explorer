import { Controller, Get, Post, Query } from '@nestjs/common';
import { NavigationService } from './navigation.service';

@Controller('navigation')
export class NavigationController {
  constructor(private readonly navService: NavigationService) {}

  @Get()
  async list(@Query('refresh') refresh?: string) {
    if (refresh === 'true') {
      await this.navService.ensureSeed();
    }
    return this.navService.findAll();
  }

  // Still keep a POST if you like a dedicated reseed action
  @Post('refresh')
  async refresh() {
    await this.navService.ensureSeed();
    return this.navService.findAll();
  }
}
