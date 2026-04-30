import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { IssueReportsController } from './issue-reports.controller';
import { IssueReportsService } from './issue-reports.service';

@Module({
  imports: [PrismaModule],
  controllers: [IssueReportsController],
  providers: [IssueReportsService],
  exports: [IssueReportsService],
})
export class IssueReportsModule {}
