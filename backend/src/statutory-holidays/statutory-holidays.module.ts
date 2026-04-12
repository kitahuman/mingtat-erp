import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StatutoryHolidaysService } from './statutory-holidays.service';
import { StatutoryHolidaysController } from './statutory-holidays.controller';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [PrismaModule, AuditLogsModule],
  providers: [StatutoryHolidaysService],
  controllers: [StatutoryHolidaysController],
  exports: [StatutoryHolidaysService],
})
export class StatutoryHolidaysModule {}
