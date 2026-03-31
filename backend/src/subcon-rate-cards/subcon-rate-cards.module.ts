import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubconRateCard } from './subcon-rate-card.entity';
import { SubconRateCardsService } from './subcon-rate-cards.service';
import { SubconRateCardsController } from './subcon-rate-cards.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SubconRateCard])],
  providers: [SubconRateCardsService],
  controllers: [SubconRateCardsController],
  exports: [SubconRateCardsService],
})
export class SubconRateCardsModule {}
