import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WorkLogsService } from './work-logs.service';
import { WorkLogsController } from './work-logs.controller';
import { WorkLogsGateway } from './work-logs.gateway';
import { WorkLogLocksService } from './work-log-locks.service';
import { PricingModule } from '../common/pricing.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { AuthModule } from '../auth/auth.module';
import { AiKnowledgeModule } from '../ai-knowledge/ai-knowledge.module';
import { VerificationModule } from '../verification/verification.module';

@Module({
  imports: [PrismaModule, AuthModule, PricingModule, AuditLogsModule, AiKnowledgeModule, VerificationModule],
  controllers: [WorkLogsController],
  providers: [WorkLogsService, WorkLogLocksService, WorkLogsGateway],
  exports: [WorkLogsService],
})
export class WorkLogsModule {}
