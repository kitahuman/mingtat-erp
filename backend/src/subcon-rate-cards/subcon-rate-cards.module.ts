import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SubconRateCardsService } from './subcon-rate-cards.service';
import { SubconRateCardsController } from './subcon-rate-cards.controller';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [PrismaModule, AuditLogsModule],
  providers: [SubconRateCardsService],
  controllers: [SubconRateCardsController],
  exports: [SubconRateCardsService],
})
export class SubconRateCardsModule {}
