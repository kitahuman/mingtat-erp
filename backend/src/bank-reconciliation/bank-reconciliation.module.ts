import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BankReconciliationService } from './bank-reconciliation.service';
import { BankReconciliationController } from './bank-reconciliation.controller';
import { PdfParserService } from './pdf-parser.service';

@Module({
  imports: [PrismaModule],
  providers: [BankReconciliationService, PdfParserService],
  controllers: [BankReconciliationController],
  exports: [BankReconciliationService],
})
export class BankReconciliationModule {}
