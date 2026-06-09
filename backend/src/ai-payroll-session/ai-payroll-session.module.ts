import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { PrismaModule } from '../prisma/prisma.module';
import { AiPayrollModule } from '../ai-payroll/ai-payroll.module';
import { PayrollModule } from '../payroll/payroll.module';
import { AiKnowledgeModule } from '../ai-knowledge/ai-knowledge.module';
import { AiActivityLogModule } from '../ai-activity-log/ai-activity-log.module';
import { AiPayrollSessionController } from './ai-payroll-session.controller';
import { AiPayrollSessionService } from './ai-payroll-session.service';
import { AiPayrollReconcileService } from './ai-payroll-reconcile.service';
import { AiPayrollQuestionService } from './ai-payroll-question.service';
import { AiPayrollGenerateService } from './ai-payroll-generate.service';

@Module({
  imports: [
    PrismaModule,
    AiPayrollModule,
    PayrollModule,
    AiKnowledgeModule,
    AiActivityLogModule,
    MulterModule,
  ],
  controllers: [AiPayrollSessionController],
  providers: [
    AiPayrollSessionService,
    AiPayrollReconcileService,
    AiPayrollQuestionService,
    AiPayrollGenerateService,
  ],
  exports: [
    AiPayrollSessionService,
    AiPayrollReconcileService,
    AiPayrollQuestionService,
    AiPayrollGenerateService,
  ],
})
export class AiPayrollSessionModule {}
