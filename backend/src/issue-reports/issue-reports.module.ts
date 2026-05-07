import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { PrismaModule } from '../prisma/prisma.module';
import { IssueReportsController } from './issue-reports.controller';
import { IssueReportsService } from './issue-reports.service';

@Module({
  imports: [PrismaModule, MulterModule.register({})],
  controllers: [IssueReportsController],
  providers: [IssueReportsService],
  exports: [IssueReportsService],
})
export class IssueReportsModule {}
