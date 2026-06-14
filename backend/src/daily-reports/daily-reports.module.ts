import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { DailyReportsController } from './daily-reports.controller';
import { DailyReportsService } from './daily-reports.service';
import { ProjectsModule } from '../projects/projects.module';
import { VerificationModule } from '../verification/verification.module';

@Module({
  imports: [MulterModule.register({}), ProjectsModule, VerificationModule],
  controllers: [DailyReportsController],
  providers: [DailyReportsService],
  exports: [DailyReportsService],
})
export class DailyReportsModule {}
