import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FleetRateCardsService } from './fleet-rate-cards.service';
import { FleetRateCardsController } from './fleet-rate-cards.controller';

@Module({
  imports: [PrismaModule],
  providers: [FleetRateCardsService],
  controllers: [FleetRateCardsController],
  exports: [FleetRateCardsService],
})
export class FleetRateCardsModule {}
