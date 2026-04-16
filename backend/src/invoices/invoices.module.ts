import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { PaymentInModule } from '../payment-in/payment-in.module';
@Module({
  imports: [PrismaModule, AuditLogsModule, PaymentInModule],
  controllers: [InvoicesController],
  providers: [InvoicesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
