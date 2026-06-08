import { Module } from '@nestjs/common';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { PrismaModule } from '../prisma/prisma.module';
import { InvoiceStatementPdfService } from './invoice-statement-pdf.service';
import { InvoiceStatementsController } from './invoice-statements.controller';
import { InvoiceStatementsService } from './invoice-statements.service';

@Module({
  imports: [PrismaModule, AuditLogsModule],
  controllers: [InvoiceStatementsController],
  providers: [InvoiceStatementsService, InvoiceStatementPdfService],
  exports: [InvoiceStatementsService],
})
export class InvoiceStatementsModule {}
