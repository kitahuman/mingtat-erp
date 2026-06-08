import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface KnowledgeCorrectionCandidateParams {
  moduleCode: string;
  taskType: string;
  sourceEntityType: string;
  sourceEntityId: number;
  fieldName: string;
  beforeValue?: string;
  afterValue: string;
  entityType?: string;
  entityId?: number;
  title?: string;
  summary?: string;
  confirmedBy?: number;
  extraPayload?: Record<string, unknown>;
}

export interface KnowledgeUsageOutcome {
  entryId: number;
  outcome: 'helpful' | 'neutral' | 'wrong' | 'ignored';
  taskModuleCode?: string;
  taskType?: string;
  taskEntityId?: number;
  retrievalScore?: number;
  injectedToPrompt?: boolean;
  appliedByRuleEngine?: boolean;
}

@Injectable()
export class AiKnowledgeCandidateService {
  constructor(private readonly prisma: PrismaService) {}

  async createCandidateFromCorrection(params: KnowledgeCorrectionCandidateParams) {
    const policy = await this.prisma.aiKnowledgeModulePolicy.findUnique({
      where: { policy_module_code: params.moduleCode },
    });
    if (policy && !policy.policy_auto_candidate_enabled) {
      return { skipped: true, reason: 'module_policy_disabled' };
    }

    const category = 'field_correction';
    const title = params.title ?? `欄位「${params.fieldName}」修正：${params.beforeValue ?? '空值'} → ${params.afterValue}`;
    const keywords = this.buildKeywords(params);
    const similar = await this.findSimilarKnowledge(params, keywords);

    if (similar) {
      const updated = await this.prisma.aiKnowledgeEntry.update({
        where: { id: similar.id },
        data: { knowledge_support_count: { increment: 1 } },
      });
      await this.createEvidence(updated.id, params);
      await this.checkPromotionThreshold(updated.id);
      return { skipped: false, entryId: updated.id, action: 'support_incremented' };
    }

    const payload: Record<string, unknown> = {
      fieldName: params.fieldName,
      beforeValue: params.beforeValue,
      afterValue: params.afterValue,
      taskType: params.taskType,
      ...(params.extraPayload ?? {}),
    };
    const entry = await this.prisma.aiKnowledgeEntry.create({
      data: {
        knowledge_module_scope: 'module',
        knowledge_module_code: params.moduleCode,
        knowledge_category: category,
        knowledge_title: title,
        knowledge_description: params.summary ?? '由人工修正 AI 識別結果自動生成的候選知識。',
        knowledge_payload_json: payload as Prisma.InputJsonValue,
        knowledge_applies_to_entity_type: params.entityType,
        knowledge_applies_to_entity_id: params.entityId,
        knowledge_keywords: keywords as Prisma.InputJsonValue,
        knowledge_confidence_score: 60,
        knowledge_support_count: 1,
        knowledge_status: 'candidate',
        knowledge_created_by_type: 'ai',
        knowledge_created_by: params.confirmedBy,
      },
    });
    await this.prisma.aiKnowledgeVersion.create({
      data: {
        version_knowledge_entry_id: entry.id,
        version_number: 1,
        version_payload_json: payload as Prisma.InputJsonValue,
        version_change_summary: '自動候選生成',
        version_edited_by: params.confirmedBy,
      },
    });
    await this.createEvidence(entry.id, params);
    await this.checkPromotionThreshold(entry.id);
    return { skipped: false, entryId: entry.id, action: 'candidate_created' };
  }

  async checkPromotionThreshold(entryId: number) {
    const entry = await this.prisma.aiKnowledgeEntry.findUnique({ where: { id: entryId } });
    if (!entry || entry.knowledge_status !== 'candidate') return { promoted: false };
    const policy = await this.prisma.aiKnowledgeModulePolicy.findUnique({
      where: { policy_module_code: entry.knowledge_module_code ?? '' },
    });
    const threshold = policy?.policy_review_threshold ?? 3;
    if (entry.knowledge_support_count < threshold) return { promoted: false, supportCount: entry.knowledge_support_count, threshold };
    await this.prisma.aiKnowledgeEntry.update({ where: { id: entryId }, data: { knowledge_status: 'pending_review' } });
    return { promoted: true, supportCount: entry.knowledge_support_count, threshold };
  }

  async recordUsageOutcome(knowledgeContextId: string, outcomes: KnowledgeUsageOutcome[]) {
      const results: Array<{ entryId: number; outcome: KnowledgeUsageOutcome['outcome'] }> = [];
    for (const outcome of outcomes) {
      const entryUpdate = outcome.outcome === 'wrong'
        ? { knowledge_contradiction_count: { increment: 1 } }
        : outcome.outcome === 'helpful'
          ? { knowledge_support_count: { increment: 1 } }
          : {};
      await this.prisma.$transaction([
        this.prisma.aiKnowledgeUsageLog.create({
          data: {
            usage_knowledge_entry_id: outcome.entryId,
            usage_task_module_code: outcome.taskModuleCode ?? 'unknown',
            usage_task_type: outcome.taskType ?? knowledgeContextId,
            usage_task_entity_id: outcome.taskEntityId,
            usage_retrieval_score: outcome.retrievalScore,
            usage_injected_to_prompt: outcome.injectedToPrompt ?? true,
            usage_applied_by_rule_engine: outcome.appliedByRuleEngine ?? false,
            usage_outcome: outcome.outcome,
          },
        }),
        this.prisma.aiKnowledgeEntry.update({ where: { id: outcome.entryId }, data: entryUpdate }),
      ]);
      if (outcome.outcome === 'helpful') await this.checkPromotionThreshold(outcome.entryId);
      results.push({ entryId: outcome.entryId, outcome: outcome.outcome });
    }
    return { knowledgeContextId, results };
  }

  private async findSimilarKnowledge(params: KnowledgeCorrectionCandidateParams, keywords: string[]) {
    const searchTexts = keywords.filter((keyword) => keyword.length >= 2).slice(0, 5);
    return this.prisma.aiKnowledgeEntry.findFirst({
      where: {
        knowledge_module_code: params.moduleCode,
        knowledge_category: 'field_correction',
        knowledge_status: { in: ['candidate', 'pending_review', 'approved'] },
        knowledge_applies_to_entity_type: params.entityType,
        knowledge_applies_to_entity_id: params.entityId,
        OR: searchTexts.map((keyword) => ({ knowledge_title: { contains: keyword, mode: 'insensitive' } })),
      },
      orderBy: { updated_at: 'desc' },
    });
  }

  private async createEvidence(entryId: number, params: KnowledgeCorrectionCandidateParams) {
    return this.prisma.aiKnowledgeEvidence.create({
      data: {
        evidence_knowledge_entry_id: entryId,
        evidence_source_module_code: params.moduleCode,
        evidence_source_entity_type: params.sourceEntityType,
        evidence_source_entity_id: params.sourceEntityId,
        evidence_before_value: params.beforeValue,
        evidence_after_value: params.afterValue,
        evidence_summary: params.summary ?? `人工確認 ${params.fieldName}：${params.beforeValue ?? '空值'} → ${params.afterValue}`,
        evidence_weight: 1,
        evidence_confirmed_by: params.confirmedBy,
        evidence_confirmed_at: new Date(),
      },
    });
  }

  private buildKeywords(params: KnowledgeCorrectionCandidateParams): string[] {
    return Array.from(new Set([
      params.moduleCode,
      params.taskType,
      params.fieldName,
      params.beforeValue,
      params.afterValue,
      params.entityType,
      params.entityId ? String(params.entityId) : undefined,
    ].filter((item): item is string => Boolean(item && item.trim()))));
  }
}
