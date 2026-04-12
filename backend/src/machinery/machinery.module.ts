import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MachineryService } from './machinery.service';
import { MachineryController } from './machinery.controller';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [PrismaModule, AuditLogsModule],
  providers: [MachineryService],
  controllers: [MachineryController],
  exports: [MachineryService],
})
export class MachineryModule {}
