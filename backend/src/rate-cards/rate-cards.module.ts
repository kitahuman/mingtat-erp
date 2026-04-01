import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RateCardsService } from './rate-cards.service';
import { RateCardsController } from './rate-cards.controller';

@Module({
  imports: [PrismaModule],
  providers: [RateCardsService],
  controllers: [RateCardsController],
  exports: [RateCardsService],
})
export class RateCardsModule {}
