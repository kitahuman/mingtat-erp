import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WorkLogsService } from './work-logs.service';
import { WorkLogsController } from './work-logs.controller';
import { PricingModule } from '../common/pricing.module';

@Module({
  imports: [PrismaModule, PricingModule],
  controllers: [WorkLogsController],
  providers: [WorkLogsService],
  exports: [WorkLogsService],
})
export class WorkLogsModule {}
