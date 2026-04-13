import { Module } from '@nestjs/common';
import { DailyReportStatsService } from './daily-report-stats.service';
import { DailyReportStatsController } from './daily-report-stats.controller';

@Module({
  providers: [DailyReportStatsService],
  controllers: [DailyReportStatsController],
  exports: [DailyReportStatsService],
})
export class DailyReportStatsModule {}
