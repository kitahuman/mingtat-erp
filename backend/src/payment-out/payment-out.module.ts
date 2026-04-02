import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PaymentOutService } from './payment-out.service';
import { PaymentOutController } from './payment-out.controller';

@Module({
  imports: [PrismaModule],
  providers: [PaymentOutService],
  controllers: [PaymentOutController],
  exports: [PaymentOutService],
})
export class PaymentOutModule {}
