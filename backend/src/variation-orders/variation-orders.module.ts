import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { VariationOrdersService } from './variation-orders.service';
import { VariationOrdersController, ContractSummaryController } from './variation-orders.controller';

@Module({
  imports: [PrismaModule],
  providers: [VariationOrdersService],
  controllers: [VariationOrdersController, ContractSummaryController],
  exports: [VariationOrdersService],
})
export class VariationOrdersModule {}
