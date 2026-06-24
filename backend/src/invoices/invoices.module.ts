import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { InvoicePdfService } from './invoice-pdf.service';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { PaymentInModule } from '../payment-in/payment-in.module';
import { CommonModule } from '../common/common.module';
@Module({
  imports: [PrismaModule, AuditLogsModule, PaymentInModule, CommonModule],
  controllers: [InvoicesController],
  providers: [InvoicesService, InvoicePdfService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
