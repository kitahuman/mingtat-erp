import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RateCard } from './rate-card.entity';
import { RateCardOtRate } from './rate-card-ot-rate.entity';
import { RateCardsService } from './rate-cards.service';
import { RateCardsController } from './rate-cards.controller';

@Module({
  imports: [TypeOrmModule.forFeature([RateCard, RateCardOtRate])],
  providers: [RateCardsService],
  controllers: [RateCardsController],
  exports: [RateCardsService],
})
export class RateCardsModule {}
