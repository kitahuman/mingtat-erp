import { Module } from '@nestjs/common';
import { DailyReportsController } from './daily-reports.controller';
import { DailyReportsService } from './daily-reports.service';

@Module({
  controllers: [DailyReportsController],
  providers: [DailyReportsService],
  exports: [DailyReportsService],
})
export class DailyReportsModule {}
