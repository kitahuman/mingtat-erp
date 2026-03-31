import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FleetRateCard } from './fleet-rate-card.entity';
import { FleetRateCardsService } from './fleet-rate-cards.service';
import { FleetRateCardsController } from './fleet-rate-cards.controller';

@Module({
  imports: [TypeOrmModule.forFeature([FleetRateCard])],
  providers: [FleetRateCardsService],
  controllers: [FleetRateCardsController],
  exports: [FleetRateCardsService],
})
export class FleetRateCardsModule {}
