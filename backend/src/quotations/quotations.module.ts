import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { QuotationsService } from './quotations.service';
import { QuotationPdfService } from './quotation-pdf.service';
import { QuotationsController } from './quotations.controller';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [PrismaModule, AuditLogsModule, CommonModule],
  providers: [QuotationsService, QuotationPdfService],
  controllers: [QuotationsController],
  exports: [QuotationsService],
})
export class QuotationsModule {}
