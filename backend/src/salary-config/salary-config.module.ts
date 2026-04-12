import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SalaryConfigService } from './salary-config.service';
import { SalaryConfigController } from './salary-config.controller';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [PrismaModule, AuditLogsModule],
  providers: [SalaryConfigService],
  controllers: [SalaryConfigController],
  exports: [SalaryConfigService],
})
export class SalaryConfigModule {}
