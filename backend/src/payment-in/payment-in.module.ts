import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CommonModule } from '../common/common.module';
import { PaymentInService } from './payment-in.service';
import { PaymentInController } from './payment-in.controller';
import { PaymentInAllocationService } from './payment-in-allocation.service';
import { PaymentInAllocationController } from './payment-in-allocation.controller';
import { ReceiptPdfService } from './receipt-pdf.service';

@Module({
  imports: [PrismaModule, CommonModule],
  providers: [PaymentInService, PaymentInAllocationService, ReceiptPdfService],
  controllers: [PaymentInController, PaymentInAllocationController],
  exports: [PaymentInService, PaymentInAllocationService, ReceiptPdfService],
})
export class PaymentInModule {}
