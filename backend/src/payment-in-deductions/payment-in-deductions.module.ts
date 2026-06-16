import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PaymentInDeductionsService } from './payment-in-deductions.service';
import { PaymentInDeductionsController } from './payment-in-deductions.controller';

@Module({
  imports: [PrismaModule],
  providers: [PaymentInDeductionsService],
  controllers: [PaymentInDeductionsController],
  exports: [PaymentInDeductionsService],
})
export class PaymentInDeductionsModule {}
