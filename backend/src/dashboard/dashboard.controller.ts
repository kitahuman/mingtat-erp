import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(AuthGuard('jwt'))
export class DashboardController {
  constructor(private service: DashboardService) {}

  @Get('stats')
  getStats() {
    return this.service.getStats();
  }
}
