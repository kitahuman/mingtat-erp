import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { AcceptanceReportsController } from './acceptance-reports.controller';
import { AcceptanceReportsService } from './acceptance-reports.service';

@Module({
  imports: [MulterModule.register({})],
  controllers: [AcceptanceReportsController],
  providers: [AcceptanceReportsService],
  exports: [AcceptanceReportsService],
})
export class AcceptanceReportsModule {}
