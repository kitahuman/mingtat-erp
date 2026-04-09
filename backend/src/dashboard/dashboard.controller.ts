import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(AuthGuard('jwt'))
export class DashboardController {
  constructor(private service: DashboardService) {}

  // 原有端點（向後相容）
  @Get('stats')
  getStats() {
    return this.service.getStats();
  }

  // Tab 1: 工作狀況
  @Get('work-status')
  getWorkStatus() {
    return this.service.getWorkStatus();
  }

  // Tab 2: 警告及提醒（含 MPF 提醒）
  @Get('alerts')
  getAlerts() {
    return this.service.getAlerts();
  }

  // Tab 3: 公司收支
  @Get('financial')
  getFinancial() {
    return this.service.getFinancial();
  }
}
