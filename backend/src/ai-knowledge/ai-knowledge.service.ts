import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateKnowledgeEntryDto } from './dto/create-knowledge-entry.dto';
import { QueryActivityLogsDto } from './dto/query-activity-logs.dto';
import { QueryKnowledgeDto } from './dto/query-knowledge.dto';
import {
  RetrieveKnowledgeDto,
  RetrieveKnowledgeResponseDto,
  RetrievedKnowledgeEntryDto,
} from './dto/retrieve-knowledge.dto';
import { UpdateKnowledgeEntryDto } from './dto/update-knowledge-entry.dto';
import { UpdateModulePolicyDto } from './dto/update-module-policy.dto';

const DEFAULT_ALLOWED_CATEGORIES = [
  'field_correction',
  'normalization_rule',
  'payroll_hint',
  'employee_matching',
  'site_matching',
  'vehicle_matching',
];

const ACTIVE_STATUSES = ['approved', 'active'];

const SORT_FIELD_MAP: Record<
  string,
  keyof Prisma.AiKnowledgeEntryOrderByWithRelationInput
> = {
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  usageCount: 'knowledge_usage_count',
  supportCount: 'knowledge_support_count',
  confidenceScore: 'knowledge_confidence_score',
};

type JsonRecord = Record<string, unknown>;

interface KnowledgePolicySnapshot {
  allowedCategories: string[];
  maxEntriesPerTask: number;
  maxPromptCharacters: number;
}

@Injectable()
export class AiKnowledgeService {
  constructor(private readonly prisma: PrismaService) {}

  async retrieve(
    dto: RetrieveKnowledgeDto,
  ): Promise<RetrieveKnowledgeResponseDto> {
    const policy = await this.getPolicySnapshot(dto.moduleCode);
    const maxEntries = Math.min(
      dto.limits?.maxEntries ?? policy.maxEntriesPerTask,
      policy.maxEntriesPerTask,
    );
    const maxPromptCharacters = Math.min(
      dto.limits?.maxPromptCharacters ?? policy.maxPromptCharacters,
      policy.maxPromptCharacters,
    );
    const contextTokens = this.extractContextTokens(dto.context as JsonRecord);
    const now = new Date();

    const candidates = await this.prisma.aiKnowledgeEntry.findMany({
      where: {
        knowledge_status: { in: ACTIVE_STATUSES },
        knowledge_category: { in: policy.allowedCategories },
        OR: [
          { knowledge_module_scope: 'global' },
          { knowledge_module_code: dto.moduleCode },
        ],
        AND: [
          {
            OR: [
              { knowledge_effective_from: null },
              { knowledge_effective_from: { lte: now } },
            ],
          },
          {
            OR: [
              { knowledge_effective_to: null },
              { knowledge_effective_to: { gte: now } },
            ],
          },
        ],
      },
      orderBy: [
        { knowledge_usage_count: 'desc' },
        { knowledge_confidence_score: 'desc' },
        { updated_at: 'desc' },
      ],
      take: Math.max(maxEntries * 5, 50),
    });

    const scored = candidates
      .map((entry) => ({
        entry,
        score: this.calculateRetrievalScore(
          entry,
          contextTokens,
          dto.moduleCode,
        ),
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score);

    const entries: RetrievedKnowledgeEntryDto[] = [];
    let usedCharacters = 0;
    for (const item of scored) {
      if (entries.length >= maxEntries) break;
      const promptSnippet = this.buildPromptSnippet(item.entry);
      if (
        usedCharacters + promptSnippet.length > maxPromptCharacters &&
        entries.length > 0
      )
        break;
      entries.push({
        entryId: item.entry.id,
        category: item.entry.knowledge_category,
        moduleScope: item.entry.knowledge_module_scope,
        title: item.entry.knowledge_title,
        retrievalScore: Number(item.score.toFixed(4)),
        promptSnippet,
        payload: this.asJsonRecord(item.entry.knowledge_payload_json),
      });
      usedCharacters += promptSnippet.length;
    }

    const knowledgeContextId = randomUUID();
    if (entries.length > 0) {
      const operations: Prisma.PrismaPromise<unknown>[] = [];
      entries.forEach((entry) => {
        operations.push(
          this.prisma.aiKnowledgeUsageLog.create({
            data: {
              usage_knowledge_entry_id: entry.entryId,
              usage_task_module_code: dto.moduleCode,
              usage_task_type: dto.taskType,
              usage_retrieval_score: entry.retrievalScore,
              usage_injected_to_prompt: true,
            },
          }),
        );
        operations.push(
          this.prisma.aiKnowledgeEntry.update({
            where: { id: entry.entryId },
            data: {
              knowledge_usage_count: { increment: 1 },
              knowledge_last_used_at: new Date(),
            },
          }),
        );
      });
      await this.prisma.$transaction(operations);
    }

    return { knowledgeContextId, entries };
  }

  async findAll(query: QueryKnowledgeDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.AiKnowledgeEntryWhereInput = {
      ...(query.moduleCode ? { knowledge_module_code: query.moduleCode } : {}),
      ...(query.category ? { knowledge_category: query.category } : {}),
      ...(query.status
        ? query.status === 'active'
          ? { knowledge_status: { in: ACTIVE_STATUSES } }
          : { knowledge_status: query.status }
        : { knowledge_status: { not: 'deleted' } }),
      ...(query.entityType
        ? { knowledge_applies_to_entity_type: query.entityType }
        : {}),
      ...(query.entityId
        ? { knowledge_applies_to_entity_id: query.entityId }
        : {}),
      ...(query.search
        ? {
            OR: [
              {
                knowledge_title: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
              {
                knowledge_description: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };
    const orderField =
      SORT_FIELD_MAP[query.sortBy ?? 'updatedAt'] ?? 'updated_at';
    const orderBy: Prisma.AiKnowledgeEntryOrderByWithRelationInput = {
      [orderField]: query.sortOrder ?? 'desc',
    };
    const [data, total] = await Promise.all([
      this.prisma.aiKnowledgeEntry.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { evidence: true, reviews: true },
      }),
      this.prisma.aiKnowledgeEntry.count({ where }),
    ]);
    return {
      data: data.map((entry) => this.formatKnowledgeEntry(entry)),
      total,
      page,
      pageSize,
    };
  }

  async findOne(id: number) {
    const entry = await this.prisma.aiKnowledgeEntry.findUnique({
      where: { id },
      include: {
        evidence: { orderBy: { evidence_created_at: 'desc' } },
        versions: { orderBy: { version_number: 'desc' } },
        reviews: { orderBy: { review_created_at: 'desc' } },
        usage_logs: { orderBy: { usage_used_at: 'desc' }, take: 50 },
      },
    });
    if (!entry || entry.knowledge_status === 'deleted') {
      throw new NotFoundException('知識不存在');
    }
    return this.formatKnowledgeEntry(entry);
  }

  async create(dto: CreateKnowledgeEntryDto, userId: number) {
    const entry = await this.prisma.aiKnowledgeEntry.create({
      data: {
        knowledge_module_scope: dto.moduleScope,
        knowledge_module_code: dto.moduleCode,
        knowledge_category: dto.category,
        knowledge_title: dto.title,
        knowledge_description: dto.description,
        knowledge_payload_json: dto.payload as Prisma.InputJsonValue,
        knowledge_applies_to_entity_type: dto.appliesToEntityType,
        knowledge_applies_to_entity_id: dto.appliesToEntityId,
        knowledge_keywords: dto.keywords as Prisma.InputJsonValue | undefined,
        knowledge_confidence_score: dto.confidenceScore ?? 80,
        knowledge_status: dto.status ?? 'approved',
        knowledge_effective_from: dto.effectiveFrom
          ? new Date(dto.effectiveFrom)
          : undefined,
        knowledge_effective_to: dto.effectiveTo
          ? new Date(dto.effectiveTo)
          : undefined,
        knowledge_created_by_type: dto.createdByType ?? 'manual',
        knowledge_created_by: userId,
        knowledge_approved_by:
          dto.status === 'approved' || !dto.status ? userId : undefined,
        knowledge_approved_at:
          dto.status === 'approved' || !dto.status ? new Date() : undefined,
      },
    });

    await this.createVersion(entry.id, 1, dto.payload, '建立知識', userId);
    if (dto.evidence?.length) {
      await this.prisma.aiKnowledgeEvidence.createMany({
        data: dto.evidence.map((evidence) => ({
          evidence_knowledge_entry_id: entry.id,
          evidence_source_module_code: evidence.sourceModuleCode,
          evidence_source_entity_type: evidence.sourceEntityType,
          evidence_source_entity_id: evidence.sourceEntityId,
          evidence_before_value: evidence.beforeValue,
          evidence_after_value: evidence.afterValue,
          evidence_summary: evidence.summary,
          evidence_weight: evidence.weight ?? 1,
          evidence_confirmed_by: userId,
          evidence_confirmed_at: new Date(),
        })),
      });
    }
    return this.findOne(entry.id);
  }

  async update(id: number, dto: UpdateKnowledgeEntryDto, userId: number) {
    await this.findOne(id);
    const existingVersionCount = await this.prisma.aiKnowledgeVersion.count({
      where: { version_knowledge_entry_id: id },
    });
    const data: Prisma.AiKnowledgeEntryUpdateInput = {
      ...(dto.moduleScope ? { knowledge_module_scope: dto.moduleScope } : {}),
      ...(dto.moduleCode !== undefined
        ? { knowledge_module_code: dto.moduleCode }
        : {}),
      ...(dto.category ? { knowledge_category: dto.category } : {}),
      ...(dto.title ? { knowledge_title: dto.title } : {}),
      ...(dto.description ? { knowledge_description: dto.description } : {}),
      ...(dto.payload
        ? { knowledge_payload_json: dto.payload as Prisma.InputJsonValue }
        : {}),
      ...(dto.appliesToEntityType !== undefined
        ? { knowledge_applies_to_entity_type: dto.appliesToEntityType }
        : {}),
      ...(dto.appliesToEntityId !== undefined
        ? { knowledge_applies_to_entity_id: dto.appliesToEntityId }
        : {}),
      ...(dto.keywords !== undefined
        ? { knowledge_keywords: dto.keywords as Prisma.InputJsonValue }
        : {}),
      ...(dto.confidenceScore !== undefined
        ? { knowledge_confidence_score: dto.confidenceScore }
        : {}),
      ...(dto.status ? { knowledge_status: dto.status } : {}),
      ...(dto.effectiveFrom !== undefined
        ? {
            knowledge_effective_from: dto.effectiveFrom
              ? new Date(dto.effectiveFrom)
              : null,
          }
        : {}),
      ...(dto.effectiveTo !== undefined
        ? {
            knowledge_effective_to: dto.effectiveTo
              ? new Date(dto.effectiveTo)
              : null,
          }
        : {}),
    };
    const updated = await this.prisma.aiKnowledgeEntry.update({
      where: { id },
      data,
    });
    await this.createVersion(
      id,
      existingVersionCount + 1,
      this.asJsonRecord(updated.knowledge_payload_json),
      '編輯知識內容',
      userId,
    );
    return this.findOne(id);
  }

  async approve(id: number, reason: string | undefined, userId: number) {
    await this.findOne(id);
    await this.prisma.$transaction([
      this.prisma.aiKnowledgeEntry.update({
        where: { id },
        data: {
          knowledge_status: 'approved',
          knowledge_approved_by: userId,
          knowledge_approved_at: new Date(),
        },
      }),
      this.prisma.aiKnowledgeReview.create({
        data: {
          review_knowledge_entry_id: id,
          review_action: 'approve',
          review_reason: reason,
          review_user_id: userId,
        },
      }),
    ]);
    return this.findOne(id);
  }

  async enable(id: number, reason: string | undefined, userId: number) {
    await this.findOne(id);
    await this.prisma.$transaction([
      this.prisma.aiKnowledgeEntry.update({
        where: { id },
        data: {
          knowledge_status: 'approved',
          knowledge_approved_by: userId,
          knowledge_approved_at: new Date(),
        },
      }),
      this.prisma.aiKnowledgeReview.create({
        data: {
          review_knowledge_entry_id: id,
          review_action: 'enable',
          review_reason: reason,
          review_user_id: userId,
        },
      }),
    ]);
    return this.findOne(id);
  }

  async batchApprove(
    ids: number[],
    reason: string | undefined,
    userId: number,
  ) {
    const uniqueIds = Array.from(
      new Set(
        (ids ?? [])
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id) && id > 0),
      ),
    );
    if (uniqueIds.length === 0)
      throw new BadRequestException('請選擇要審核的知識');

    const entries = await this.prisma.aiKnowledgeEntry.findMany({
      where: { id: { in: uniqueIds }, knowledge_status: { not: 'deleted' } },
      select: { id: true },
    });
    const foundIds = new Set(entries.map((entry) => entry.id));
    const missingIds = uniqueIds.filter((id) => !foundIds.has(id));
    if (missingIds.length > 0)
      throw new NotFoundException(`知識不存在：${missingIds.join(', ')}`);

    await this.prisma.$transaction([
      this.prisma.aiKnowledgeEntry.updateMany({
        where: { id: { in: uniqueIds } },
        data: {
          knowledge_status: 'approved',
          knowledge_approved_by: userId,
          knowledge_approved_at: new Date(),
        },
      }),
      this.prisma.aiKnowledgeReview.createMany({
        data: uniqueIds.map((id) => ({
          review_knowledge_entry_id: id,
          review_action: 'approve',
          review_reason: reason ?? '批量審核通過',
          review_user_id: userId,
        })),
      }),
    ]);

    const approvedEntries = await this.prisma.aiKnowledgeEntry.findMany({
      where: { id: { in: uniqueIds } },
      include: { evidence: true, reviews: true },
      orderBy: { updated_at: 'desc' },
    });
    return {
      approved: uniqueIds.length,
      ids: uniqueIds,
      data: approvedEntries.map((entry) => this.formatKnowledgeEntry(entry)),
    };
  }

  async reject(id: number, reason: string, userId: number) {
    if (!reason.trim()) throw new BadRequestException('拒絕原因不可為空');
    await this.findOne(id);
    await this.prisma.$transaction([
      this.prisma.aiKnowledgeEntry.update({
        where: { id },
        data: { knowledge_status: 'rejected' },
      }),
      this.prisma.aiKnowledgeReview.create({
        data: {
          review_knowledge_entry_id: id,
          review_action: 'reject',
          review_reason: reason,
          review_user_id: userId,
        },
      }),
    ]);
    return this.findOne(id);
  }

  async disable(id: number, reason: string | undefined, userId: number) {
    await this.findOne(id);
    await this.prisma.$transaction([
      this.prisma.aiKnowledgeEntry.update({
        where: { id },
        data: { knowledge_status: 'disabled' },
      }),
      this.prisma.aiKnowledgeReview.create({
        data: {
          review_knowledge_entry_id: id,
          review_action: 'disable',
          review_reason: reason,
          review_user_id: userId,
        },
      }),
    ]);
    return this.findOne(id);
  }

  async softDelete(id: number, userId: number) {
    await this.findOne(id);
    await this.prisma.$transaction([
      this.prisma.aiKnowledgeEntry.update({
        where: { id },
        data: { knowledge_status: 'deleted' },
      }),
      this.prisma.aiKnowledgeReview.create({
        data: {
          review_knowledge_entry_id: id,
          review_action: 'delete',
          review_reason: '軟刪除',
          review_user_id: userId,
        },
      }),
    ]);
    return { success: true };
  }

  async usageLogs(id: number, page = 1, pageSize = 20) {
    await this.findOne(id);
    const [data, total] = await Promise.all([
      this.prisma.aiKnowledgeUsageLog.findMany({
        where: { usage_knowledge_entry_id: id },
        orderBy: { usage_used_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.aiKnowledgeUsageLog.count({
        where: { usage_knowledge_entry_id: id },
      }),
    ]);
    return { data, total, page, pageSize };
  }

  async findActivityLogs(query: QueryActivityLogsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.AiActivityLogWhereInput = {
      ...(query.moduleCode ? { activity_module_code: query.moduleCode } : {}),
      ...(query.activityType ? { activity_type: query.activityType } : {}),
      ...(query.action ? { activity_action: query.action } : {}),
      ...(query.result ? { activity_result: query.result } : {}),
      ...(query.entityType ? { activity_entity_type: query.entityType } : {}),
      ...(query.entityId ? { activity_entity_id: query.entityId } : {}),
      ...(query.search
        ? {
            OR: [
              { activity_action: { contains: query.search } },
              { activity_description: { contains: query.search } },
              { activity_reason: { contains: query.search } },
              { activity_input_summary: { contains: query.search } },
              { activity_output_summary: { contains: query.search } },
            ],
          }
        : {}),
    };
    const orderBy: Prisma.AiActivityLogOrderByWithRelationInput =
      query.sortBy === 'confidence'
        ? { activity_confidence: query.sortOrder ?? 'desc' }
        : { activity_created_at: query.sortOrder ?? 'desc' };

    const [data, total] = await Promise.all([
      this.prisma.aiActivityLog.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.aiActivityLog.count({ where }),
    ]);
    return { data, total, page, pageSize };
  }

  async migrateExistingData(userId: number) {
    const existingEntries = await this.prisma.aiKnowledgeEntry.findMany({
      where: { knowledge_category: 'nickname_mapping' },
      select: { knowledge_payload_json: true },
    });
    const existingKeys = new Set(
      existingEntries.map((entry) => {
        const payload = this.asJsonRecord(entry.knowledge_payload_json);
        return this.buildNicknameKnowledgeKey(
          typeof payload.nickname === 'string' ? payload.nickname : '',
          typeof payload.employeeId === 'number' ? payload.employeeId : null,
          typeof payload.vehicleNo === 'string' ? payload.vehicleNo : null,
        );
      }),
    );

    let verificationCreated = 0;
    let verificationSkipped = 0;
    let employeeCreated = 0;
    let employeeSkipped = 0;

    const verificationMappings =
      await this.prisma.verificationNicknameMapping.findMany({
        orderBy: { id: 'asc' },
      });

    for (const mapping of verificationMappings) {
      const nickname = mapping.nickname_value?.trim();
      if (!nickname) {
        verificationSkipped += 1;
        continue;
      }
      const key = this.buildNicknameKnowledgeKey(
        nickname,
        mapping.nickname_employee_id ?? null,
        mapping.nickname_vehicle_no ?? null,
      );
      if (existingKeys.has(key)) {
        verificationSkipped += 1;
        continue;
      }

      const isVehicleMapping =
        !mapping.nickname_employee_id && !!mapping.nickname_vehicle_no;
      const targetLabel =
        mapping.nickname_employee_name ||
        mapping.nickname_vehicle_no ||
        '未指定對象';
      await this.prisma.aiKnowledgeEntry.create({
        data: {
          knowledge_module_scope: 'global',
          knowledge_module_code: null,
          knowledge_category: 'nickname_mapping',
          knowledge_title: `${nickname} → ${targetLabel}`,
          knowledge_description: `花名/簡稱對照：${nickname} 代表 ${targetLabel}`,
          knowledge_payload_json: {
            nickname,
            employeeId: mapping.nickname_employee_id,
            employeeName: mapping.nickname_employee_name,
            vehicleNo: mapping.nickname_vehicle_no,
          } as Prisma.InputJsonValue,
          knowledge_applies_to_entity_type: isVehicleMapping
            ? 'vehicle'
            : 'employee',
          knowledge_applies_to_entity_id: mapping.nickname_employee_id,
          knowledge_status: mapping.nickname_is_active ? 'active' : 'disabled',
          knowledge_created_by_type: 'system',
          knowledge_created_by: userId || undefined,
          knowledge_confidence_score: 100,
        },
      });
      existingKeys.add(key);
      verificationCreated += 1;
    }

    const employeeNicknames = await this.prisma.employeeNickname.findMany({
      include: { employee: { select: { id: true, name_zh: true } } },
      orderBy: { id: 'asc' },
    });

    for (const nicknameRecord of employeeNicknames) {
      const nickname = nicknameRecord.emp_nickname_value?.trim();
      const employeeId = nicknameRecord.emp_nickname_employee_id;
      if (!nickname || !employeeId) {
        employeeSkipped += 1;
        continue;
      }
      const key = this.buildNicknameKnowledgeKey(nickname, employeeId, null);
      if (existingKeys.has(key)) {
        employeeSkipped += 1;
        continue;
      }
      const employeeName =
        nicknameRecord.employee?.name_zh || `員工 #${employeeId}`;
      await this.prisma.aiKnowledgeEntry.create({
        data: {
          knowledge_module_scope: 'global',
          knowledge_module_code: null,
          knowledge_category: 'nickname_mapping',
          knowledge_title: `${nickname} → ${employeeName}`,
          knowledge_description: `花名/簡稱對照：${nickname} 代表 ${employeeName}`,
          knowledge_payload_json: {
            nickname,
            employeeId,
            employeeName,
            vehicleNo: null,
          } as Prisma.InputJsonValue,
          knowledge_applies_to_entity_type: 'employee',
          knowledge_applies_to_entity_id: employeeId,
          knowledge_status: 'active',
          knowledge_created_by_type: 'system',
          knowledge_created_by: userId || undefined,
          knowledge_confidence_score: 100,
        },
      });
      existingKeys.add(key);
      employeeCreated += 1;
    }

    const created = verificationCreated + employeeCreated;
    const skipped = verificationSkipped + employeeSkipped;
    await this.prisma.aiActivityLog.create({
      data: {
        activity_module_code: 'nickname_match',
        activity_type: 'learning',
        activity_action: 'migrate_existing_nickname_data',
        activity_description: `匯入既有花名/簡稱對照到 AI 知識庫：新增 ${created} 條，跳過 ${skipped} 條。`,
        activity_reason:
          '系統管理員觸發既有資料遷移，將人工確認過的花名資料轉為全域 AI 知識。',
        activity_input_summary: `VerificationNicknameMapping ${verificationMappings.length} 條；EmployeeNickname ${employeeNicknames.length} 條。`,
        activity_output_summary: `新增 ${created} 條；跳過重複或無效 ${skipped} 條。`,
        activity_result: 'success',
        activity_confidence: 100,
        activity_knowledge_gained: {
          category: 'nickname_mapping',
          created,
          skipped,
          verificationCreated,
          verificationSkipped,
          employeeCreated,
          employeeSkipped,
        } as Prisma.InputJsonValue,
        activity_user_id: userId || undefined,
      },
    });

    return {
      success: true,
      created,
      skipped,
      verificationNicknameMapping: {
        scanned: verificationMappings.length,
        created: verificationCreated,
        skipped: verificationSkipped,
      },
      employeeNickname: {
        scanned: employeeNicknames.length,
        created: employeeCreated,
        skipped: employeeSkipped,
      },
    };
  }

  async listPolicies() {
    return this.prisma.aiKnowledgeModulePolicy.findMany({
      orderBy: { policy_module_code: 'asc' },
    });
  }

  async updatePolicy(moduleCode: string, dto: UpdateModulePolicyDto) {
    return this.prisma.aiKnowledgeModulePolicy.upsert({
      where: { policy_module_code: moduleCode },
      create: {
        policy_module_code: moduleCode,
        policy_allowed_categories: (dto.allowedCategories ??
          DEFAULT_ALLOWED_CATEGORIES) as Prisma.InputJsonValue,
        policy_max_entries_per_task: dto.maxEntriesPerTask ?? 20,
        policy_max_prompt_characters: dto.maxPromptCharacters ?? 4000,
        policy_auto_candidate_enabled: dto.autoCandidateEnabled ?? true,
        policy_review_threshold: dto.reviewThreshold ?? 3,
      },
      update: {
        ...(dto.allowedCategories
          ? {
              policy_allowed_categories:
                dto.allowedCategories as Prisma.InputJsonValue,
            }
          : {}),
        ...(dto.maxEntriesPerTask !== undefined
          ? { policy_max_entries_per_task: dto.maxEntriesPerTask }
          : {}),
        ...(dto.maxPromptCharacters !== undefined
          ? { policy_max_prompt_characters: dto.maxPromptCharacters }
          : {}),
        ...(dto.autoCandidateEnabled !== undefined
          ? { policy_auto_candidate_enabled: dto.autoCandidateEnabled }
          : {}),
        ...(dto.reviewThreshold !== undefined
          ? { policy_review_threshold: dto.reviewThreshold }
          : {}),
      },
    });
  }

  private buildNicknameKnowledgeKey(
    nickname: string,
    employeeId?: number | null,
    vehicleNo?: string | null,
  ): string {
    const normalizedNickname = nickname.trim().toLowerCase();
    if (employeeId) return `${normalizedNickname}::employee::${employeeId}`;
    if (vehicleNo)
      return `${normalizedNickname}::vehicle::${vehicleNo.trim().toLowerCase()}`;
    return `${normalizedNickname}::unknown`;
  }

  private async getPolicySnapshot(
    moduleCode: string,
  ): Promise<KnowledgePolicySnapshot> {
    const policy = await this.prisma.aiKnowledgeModulePolicy.findUnique({
      where: { policy_module_code: moduleCode },
    });
    return {
      allowedCategories:
        this.asStringArray(policy?.policy_allowed_categories) ??
        DEFAULT_ALLOWED_CATEGORIES,
      maxEntriesPerTask: policy?.policy_max_entries_per_task ?? 20,
      maxPromptCharacters: policy?.policy_max_prompt_characters ?? 4000,
    };
  }

  private async createVersion(
    entryId: number,
    versionNumber: number,
    payload: JsonRecord,
    summary: string,
    userId: number,
  ) {
    return this.prisma.aiKnowledgeVersion.create({
      data: {
        version_knowledge_entry_id: entryId,
        version_number: versionNumber,
        version_payload_json: payload as Prisma.InputJsonValue,
        version_change_summary: summary,
        version_edited_by: userId,
      },
    });
  }

  private calculateRetrievalScore(
    entry: {
      knowledge_keywords: Prisma.JsonValue;
      knowledge_title: string;
      knowledge_description: string;
      knowledge_module_code: string | null;
      knowledge_applies_to_entity_type: string | null;
      knowledge_applies_to_entity_id: number | null;
      knowledge_confidence_score: Prisma.Decimal;
      knowledge_usage_count: number;
    },
    contextTokens: Set<string>,
    moduleCode: string,
  ): number {
    let score = entry.knowledge_module_code === moduleCode ? 2 : 1;
    const searchable = [
      entry.knowledge_title,
      entry.knowledge_description,
      ...this.asStringArray(entry.knowledge_keywords),
    ]
      .join(' ')
      .toLowerCase();
    for (const token of contextTokens) {
      if (searchable.includes(token.toLowerCase()))
        score += token.length > 2 ? 3 : 1;
    }
    score += Number(entry.knowledge_confidence_score) / 100;
    score += Math.min(entry.knowledge_usage_count / 50, 1);
    return score;
  }

  private buildPromptSnippet(entry: {
    knowledge_title: string;
    knowledge_description: string;
    knowledge_payload_json: Prisma.JsonValue;
  }): string {
    return `【${entry.knowledge_title}】${entry.knowledge_description}\n規則資料：${JSON.stringify(entry.knowledge_payload_json)}`;
  }

  private extractContextTokens(context: JsonRecord): Set<string> {
    const tokens = new Set<string>();
    const addValue = (value: unknown) => {
      if (typeof value === 'string') {
        value
          .split(/[\s,，。;；|/]+/)
          .filter((token) => token.trim().length >= 2)
          .forEach((token) => tokens.add(token.trim()));
      } else if (typeof value === 'number') {
        tokens.add(String(value));
      } else if (Array.isArray(value)) {
        value.forEach(addValue);
      } else if (value && typeof value === 'object') {
        Object.values(value as JsonRecord).forEach(addValue);
      }
    };
    addValue(context);
    return tokens;
  }

  private formatKnowledgeEntry<T extends { knowledge_status: string }>(
    entry: T,
  ): T & { status: string } {
    return { ...entry, status: this.toFrontendStatus(entry.knowledge_status) };
  }

  private toFrontendStatus(status: string): string {
    return ACTIVE_STATUSES.includes(status) ? 'active' : status;
  }

  private asJsonRecord(value: Prisma.JsonValue): JsonRecord {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as JsonRecord)
      : { value };
  }

  private asStringArray(value: Prisma.JsonValue | undefined): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  }
}
