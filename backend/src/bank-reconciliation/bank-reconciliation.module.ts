import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BankReconciliationService } from './bank-reconciliation.service';
import { BankReconciliationController } from './bank-reconciliation.controller';
import { PdfParserService } from './pdf-parser.service';
import { SystemSettingsModule } from '../system-settings/system-settings.module';

@Module({
  imports: [PrismaModule, SystemSettingsModule],
  providers: [BankReconciliationService, PdfParserService],
  controllers: [BankReconciliationController],
  exports: [BankReconciliationService],
})
export class BankReconciliationModule {}
