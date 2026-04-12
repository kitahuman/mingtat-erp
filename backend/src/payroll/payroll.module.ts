import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PayrollService } from './payroll.service';
import { PayrollController } from './payroll.controller';
import { ExpensesModule } from '../expenses/expenses.module';
import { ExpenseCategoriesModule } from '../expense-categories/expense-categories.module';
import { PricingModule } from '../common/pricing.module';
import { StatutoryHolidaysModule } from '../statutory-holidays/statutory-holidays.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [PrismaModule, ExpensesModule, ExpenseCategoriesModule, PricingModule, StatutoryHolidaysModule, AuditLogsModule],
  providers: [PayrollService],
  controllers: [PayrollController],
  exports: [PayrollService],
})
export class PayrollModule {}
