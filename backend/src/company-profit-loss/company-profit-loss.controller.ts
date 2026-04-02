import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CompanyProfitLossService } from './company-profit-loss.service';

@Controller('company-profit-loss')
@UseGuards(AuthGuard('jwt'))
export class CompanyProfitLossController {
  constructor(private service: CompanyProfitLossService) {}

  @Get()
  getCompanyProfitLoss(
    @Query('period') period?: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
    @Query('quarter') quarter?: string,
    @Query('company_id') companyId?: string,
  ) {
    return this.service.getCompanyProfitLoss({
      period,
      year: year ? parseInt(year) : undefined,
      month: month ? parseInt(month) : undefined,
      quarter: quarter ? parseInt(quarter) : undefined,
      company_id: companyId ? parseInt(companyId) : undefined,
    });
  }

  @Get('trend')
  getMonthlyTrend(
    @Query('company_id') companyId?: string,
    @Query('months') months?: string,
  ) {
    return this.service.getMonthlyTrend({
      company_id: companyId ? parseInt(companyId) : undefined,
      months: months ? parseInt(months) : undefined,
    });
  }
}
