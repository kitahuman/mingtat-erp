import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PaymentOutService } from './payment-out.service';
import { PaymentOutController } from './payment-out.controller';
import { PaymentOutAllocationService } from './payment-out-allocation.service';
import { PaymentOutAllocationController } from './payment-out-allocation.controller';

@Module({
  imports: [PrismaModule],
  providers: [PaymentOutService, PaymentOutAllocationService],
  controllers: [PaymentOutController, PaymentOutAllocationController],
  exports: [PaymentOutService, PaymentOutAllocationService],
})
export class PaymentOutModule {}
