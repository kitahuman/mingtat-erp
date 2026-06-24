import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PayrollService } from './payroll.service';
import { PayrollCalculationService } from './payroll-calculation.service';
import { PayrollPdfService } from './payroll-pdf.service';
import { PayrollController } from './payroll.controller';
import { ExpensesModule } from '../expenses/expenses.module';
import { ExpenseCategoriesModule } from '../expense-categories/expense-categories.module';
import { PricingModule } from '../common/pricing.module';
import { StatutoryHolidaysModule } from '../statutory-holidays/statutory-holidays.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { FleetRateCardsModule } from '../fleet-rate-cards/fleet-rate-cards.module';
import { PettyCashModule } from '../petty-cash/petty-cash.module';
import { PaymentOutModule } from '../payment-out/payment-out.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [
    PrismaModule,
    CommonModule,
    ExpensesModule,
    ExpenseCategoriesModule,
    PricingModule,
    StatutoryHolidaysModule,
    AuditLogsModule,
    FleetRateCardsModule,
    PettyCashModule,
    forwardRef(() => PaymentOutModule),
  ],
  providers: [PayrollService, PayrollCalculationService, PayrollPdfService],
  controllers: [PayrollController],
  exports: [PayrollService, PayrollCalculationService],
})
export class PayrollModule {}
