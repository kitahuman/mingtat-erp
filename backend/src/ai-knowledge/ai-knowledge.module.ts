import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AiKnowledgeController } from './ai-knowledge.controller';
import { AiKnowledgeService } from './ai-knowledge.service';
import { AiKnowledgeCandidateService } from './ai-knowledge-candidate.service';

@Module({
  imports: [PrismaModule],
  controllers: [AiKnowledgeController],
  providers: [AiKnowledgeService, AiKnowledgeCandidateService],
  exports: [AiKnowledgeService, AiKnowledgeCandidateService],
})
export class AiKnowledgeModule {}
