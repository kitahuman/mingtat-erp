import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { PettyCashModule } from '../petty-cash/petty-cash.module';

@Module({
  imports: [
    PrismaModule,
    MulterModule.register({}), AuditLogsModule, PettyCashModule],
  controllers: [ExpensesController],
  providers: [ExpensesService],
  exports: [ExpensesService],
})
export class ExpensesModule {}
