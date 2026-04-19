import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PaymentInService } from './payment-in.service';
import { PaymentInController } from './payment-in.controller';
import { PaymentInAllocationService } from './payment-in-allocation.service';
import { PaymentInAllocationController } from './payment-in-allocation.controller';

@Module({
  imports: [PrismaModule],
  providers: [PaymentInService, PaymentInAllocationService],
  controllers: [PaymentInController, PaymentInAllocationController],
  exports: [PaymentInService, PaymentInAllocationService],
})
export class PaymentInModule {}
