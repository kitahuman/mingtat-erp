import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EquipmentProfitService } from './equipment-profit.service';
import { EquipmentProfitController } from './equipment-profit.controller';

@Module({
  imports: [PrismaModule],
  providers: [EquipmentProfitService],
  controllers: [EquipmentProfitController],
  exports: [EquipmentProfitService],
})
export class EquipmentProfitModule {}
