import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SubconRateCardsService } from './subcon-rate-cards.service';
import { SubconRateCardsController } from './subcon-rate-cards.controller';

@Module({
  imports: [PrismaModule],
  providers: [SubconRateCardsService],
  controllers: [SubconRateCardsController],
  exports: [SubconRateCardsService],
})
export class SubconRateCardsModule {}
