import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PaymentInService } from './payment-in.service';
import { PaymentInController } from './payment-in.controller';

@Module({
  imports: [PrismaModule],
  providers: [PaymentInService],
  controllers: [PaymentInController],
  exports: [PaymentInService],
})
export class PaymentInModule {}
