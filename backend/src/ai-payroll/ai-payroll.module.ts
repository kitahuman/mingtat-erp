import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AiKnowledgeModule } from '../ai-knowledge/ai-knowledge.module';
import { AiPayrollController } from './ai-payroll.controller';
import { AiPayrollService } from './ai-payroll.service';
import { AiPayrollExtractionService } from './ai-payroll-extraction.service';

@Module({
  imports: [PrismaModule, AiKnowledgeModule],
  controllers: [AiPayrollController],
  providers: [AiPayrollService, AiPayrollExtractionService],
  exports: [AiPayrollService, AiPayrollExtractionService],
})
export class AiPayrollModule {}
