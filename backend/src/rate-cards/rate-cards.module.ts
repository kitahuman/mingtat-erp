import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RateCardsService } from './rate-cards.service';
import { RateCardsController } from './rate-cards.controller';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [PrismaModule, AuditLogsModule],
  providers: [RateCardsService],
  controllers: [RateCardsController],
  exports: [RateCardsService],
})
export class RateCardsModule {}
