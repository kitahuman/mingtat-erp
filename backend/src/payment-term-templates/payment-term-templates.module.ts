import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PaymentTermTemplatesController } from './payment-term-templates.controller';
import { PaymentTermTemplatesService } from './payment-term-templates.service';

@Module({
  imports: [PrismaModule],
  controllers: [PaymentTermTemplatesController],
  providers: [PaymentTermTemplatesService],
  exports: [PaymentTermTemplatesService],
})
export class PaymentTermTemplatesModule {}
