import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PaymentApplicationsService } from './payment-applications.service';
import { PaymentApplicationsController } from './payment-applications.controller';
import { PaymentInModule } from '../payment-in/payment-in.module';
import { CommonModule } from '../common/common.module';
import { IpaPdfService } from './ipa-pdf.service';
import { IpaExcelService } from './ipa-excel.service';

@Module({
  imports: [PrismaModule, PaymentInModule, CommonModule],
  providers: [PaymentApplicationsService, IpaPdfService, IpaExcelService],
  controllers: [PaymentApplicationsController],
  exports: [PaymentApplicationsService],
})
export class PaymentApplicationsModule {}
