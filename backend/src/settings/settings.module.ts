import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PaymentInSourceTypeController } from './payment-in-source-type.controller';
import { PaymentInSourceTypeService } from './payment-in-source-type.service';

@Module({
  imports: [PrismaModule],
  controllers: [PaymentInSourceTypeController],
  providers: [PaymentInSourceTypeService],
  exports: [PaymentInSourceTypeService],
})
export class SettingsModule {}
