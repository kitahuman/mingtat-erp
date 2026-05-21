import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FixedExpenseReportService } from './fixed-expense-report.service';

@Controller('reports/fixed-expenses')
@UseGuards(AuthGuard('jwt'))
export class FixedExpenseReportController {
  constructor(private service: FixedExpenseReportService) {}

  @Get()
  getMonthlyStats(
    @Query('year') year?: string,
    @Query('companyId') companyId?: string,
    @Query('company_id') companyIdSnake?: string,
  ) {
    const parsedCompanyId = companyId || companyIdSnake;

    return this.service.getMonthlyStats({
      year: year ? parseInt(year, 10) : undefined,
      companyId: parsedCompanyId ? parseInt(parsedCompanyId, 10) : undefined,
    });
  }
}
