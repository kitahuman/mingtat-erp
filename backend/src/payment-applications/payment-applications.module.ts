import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PaymentApplicationsService } from './payment-applications.service';
import { PaymentApplicationsController } from './payment-applications.controller';
import { PaymentInModule } from '../payment-in/payment-in.module';

@Module({
  imports: [PrismaModule, PaymentInModule],
  providers: [PaymentApplicationsService],
  controllers: [PaymentApplicationsController],
  exports: [PaymentApplicationsService],
})
export class PaymentApplicationsModule {}
