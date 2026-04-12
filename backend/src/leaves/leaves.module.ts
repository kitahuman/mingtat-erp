import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LeavesService } from './leaves.service';
import { LeavesController } from './leaves.controller';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [PrismaModule, AuditLogsModule],
  providers: [LeavesService],
  controllers: [LeavesController],
  exports: [LeavesService],
})
export class LeavesModule {}
