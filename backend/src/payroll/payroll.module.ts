import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PayrollService } from './payroll.service';
import { PayrollController } from './payroll.controller';
import { ExpensesModule } from '../expenses/expenses.module';
import { ExpenseCategoriesModule } from '../expense-categories/expense-categories.module';

@Module({
  imports: [PrismaModule, ExpensesModule, ExpenseCategoriesModule],
  providers: [PayrollService],
  controllers: [PayrollController],
  exports: [PayrollService],
})
export class PayrollModule {}
