import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PayrollService } from './payroll.service';
import { PayrollCalculationService } from './payroll-calculation.service';
import { PayrollController } from './payroll.controller';
import { ExpensesModule } from '../expenses/expenses.module';
import { ExpenseCategoriesModule } from '../expense-categories/expense-categories.module';
import { PricingModule } from '../common/pricing.module';
import { StatutoryHolidaysModule } from '../statutory-holidays/statutory-holidays.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { FleetRateCardsModule } from '../fleet-rate-cards/fleet-rate-cards.module';

@Module({
  imports: [
    PrismaModule,
    ExpensesModule,
    ExpenseCategoriesModule,
    PricingModule,
    StatutoryHolidaysModule,
    AuditLogsModule,
    FleetRateCardsModule,
  ],
  providers: [PayrollService, PayrollCalculationService],
  controllers: [PayrollController],
  exports: [PayrollService, PayrollCalculationService],
})
export class PayrollModule {}
