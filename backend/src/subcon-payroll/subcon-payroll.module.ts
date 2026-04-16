import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PricingModule } from '../common/pricing.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { SubconPayrollController } from './subcon-payroll.controller';
import { SubconPayrollService } from './subcon-payroll.service';

@Module({
  imports: [PrismaModule, PricingModule, ExpensesModule],
  controllers: [SubconPayrollController],
  providers: [SubconPayrollService],
})
export class SubconPayrollModule {}
