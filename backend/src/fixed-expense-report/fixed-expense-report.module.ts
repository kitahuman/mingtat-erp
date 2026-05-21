import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FixedExpenseReportController } from './fixed-expense-report.controller';
import { FixedExpenseReportService } from './fixed-expense-report.service';

@Module({
  imports: [PrismaModule],
  controllers: [FixedExpenseReportController],
  providers: [FixedExpenseReportService],
})
export class FixedExpenseReportModule {}
