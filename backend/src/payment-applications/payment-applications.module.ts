import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PaymentApplicationsService } from './payment-applications.service';
import { PaymentApplicationsController } from './payment-applications.controller';

@Module({
  imports: [PrismaModule],
  providers: [PaymentApplicationsService],
  controllers: [PaymentApplicationsController],
  exports: [PaymentApplicationsService],
})
export class PaymentApplicationsModule {}
