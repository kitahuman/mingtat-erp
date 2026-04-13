import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DailyReportStatsService } from './daily-report-stats.service';

@Controller('daily-report-stats')
@UseGuards(AuthGuard('jwt'))
export class DailyReportStatsController {
  constructor(private readonly service: DailyReportStatsService) {}

  /**
   * GET /daily-report-stats
   * Returns grouped statistics by project with item summaries
   */
  @Get()
  getStats(
    @Query('date_from') dateFrom?: string,
    @Query('date_to') dateTo?: string,
    @Query('project_id') projectId?: string,
    @Query('client_id') clientId?: string,
    @Query('client_name') clientName?: string,
    @Query('client_contract_no') clientContractNo?: string,
    @Query('status') status?: string,
  ) {
    return this.service.getStats({
      date_from: dateFrom,
      date_to: dateTo,
      project_id: projectId,
      client_id: clientId,
      client_name: clientName,
      client_contract_no: clientContractNo,
      status,
    });
  }

  /**
   * GET /daily-report-stats/project-cost/:projectId
   * Returns cost analysis for a specific project based on daily reports + rate cards
   */
  @Get('project-cost/:projectId')
  getProjectCost(
    @Param('projectId') projectId: string,
    @Query('date_from') dateFrom?: string,
    @Query('date_to') dateTo?: string,
  ) {
    return this.service.getProjectCost(Number(projectId), dateFrom, dateTo);
  }

  /**
   * GET /daily-report-stats/export
   * Returns flat row data for CSV/Excel export
   */
  @Get('export')
  getExportData(
    @Query('date_from') dateFrom?: string,
    @Query('date_to') dateTo?: string,
    @Query('project_id') projectId?: string,
    @Query('client_id') clientId?: string,
    @Query('client_name') clientName?: string,
    @Query('client_contract_no') clientContractNo?: string,
    @Query('status') status?: string,
  ) {
    return this.service.getExportData({
      date_from: dateFrom,
      date_to: dateTo,
      project_id: projectId,
      client_id: clientId,
      client_name: clientName,
      client_contract_no: clientContractNo,
      status,
    });
  }
}
