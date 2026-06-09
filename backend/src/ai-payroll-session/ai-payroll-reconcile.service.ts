import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createOpenAIClient } from '../common/openai-client';
import { PrismaService } from '../prisma/prisma.service';
import { BatchConfirmReconcileDto } from './dto/generate-payroll.dto';
import { QueryReconcileItemsDto, QuerySourcesDto } from './dto/query-session-data.dto';
import { UpdateReconcileItemDto } from './dto/update-reconcile-item.dto';
import {
  AiPayrollSourceType,
  SourceSummaryByEmployee,
  StandardizedSourceRecordData,
} from './interfaces/source-record.interface';
import {
  ReconcileDecisionResult,
  ReconcileQuestionDraft,
  ReconcileSourceComparison,
} from './interfaces/reconcile-result.interface';
import { AiPayrollQuestionService } from './ai-payroll-question.service';

interface SessionContext {
  id: number;
  companyId: number;
  dateFrom: Date;
  dateTo: Date;
  employeeIds: number[];
}

interface AiReconcileHint {
  sameLocation?: boolean;
  workType?: string | null;
  confidence?: number;
  reason?: string;
}

interface FieldVote {
  value: string | number | boolean;
  count: number;
  sourceTypes: string[];
}

type SourceRecordRow = Prisma.AiPayrollSourceRecordGetPayload<Record<string, never>>;

@Injectable()
export class AiPayrollReconcileService {
  private readonly logger = new Logger(AiPayrollReconcileService.name);
  private readonly openai = createOpenAIClient(
    process.env.OPENAI_API_KEY,
    process.env.OPENAI_API_BASE || process.env.OPENAI_BASE_URL,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly questionService: AiPayrollQuestionService,
  ) {}

  async collectSources(sessionId: number) {
    const session = await this.getSessionContext(sessionId);
    await this.prisma.aiPayrollSourceRecord.deleteMany({
      where: { source_record_session_id: sessionId },
    });

    const records: Prisma.AiPayrollSourceRecordCreateManyInput[] = [];
    records.push(...(await this.collectWorkLogSources(session)));
    records.push(...(await this.collectOcrSources(session)));

    if (records.length > 0) {
      await this.prisma.aiPayrollSourceRecord.createMany({ data: records });
    }

    const summary = await this.getSourcesSummary(sessionId);
    await this.prisma.aiPayrollSession.update({
      where: { id: sessionId },
      data: {
        session_sources_summary: summary as unknown as Prisma.InputJsonValue,
        session_current_step: 2,
      },
    });
    return { inserted: records.length, summary };
  }

  async reconcile(sessionId: number) {
    await this.getSessionContext(sessionId);
    await this.prisma.aiPayrollReconcileItem.deleteMany({
      where: { reconcile_session_id: sessionId },
    });
    await this.prisma.aiPayrollQuestion.deleteMany({
      where: { question_session_id: sessionId, question_resolved: false },
    });

    const sources = await this.prisma.aiPayrollSourceRecord.findMany({
      where: { source_record_session_id: sessionId },
      orderBy: [
        { source_record_employee_id: 'asc' },
        { source_record_date: 'asc' },
        { source_record_source_type: 'asc' },
      ],
    });

    const grouped = this.groupSources(sources);
    const allQuestions: ReconcileQuestionDraft[] = [];
    const createInputs: Prisma.AiPayrollReconcileItemCreateManyInput[] = [];

    for (const group of grouped.values()) {
      const decision = await this.decideGroup(group);
      allQuestions.push(...decision.questions);
      createInputs.push({
        reconcile_session_id: sessionId,
        reconcile_employee_id: decision.decidedData.employee_id,
        reconcile_date: new Date(decision.decidedData.date),
        reconcile_status: decision.status,
        reconcile_work_log_id: this.findWorkLogId(group),
        reconcile_decided_data: decision.decidedData as unknown as Prisma.InputJsonValue,
        reconcile_source_comparison:
          decision.comparison as unknown as Prisma.InputJsonValue,
        reconcile_decision_reason: decision.decisionReason,
        reconcile_work_type: decision.workType ?? null,
        reconcile_has_ot: decision.hasOt,
        reconcile_ot_hours:
          decision.otHours !== null && decision.otHours !== undefined
            ? new Prisma.Decimal(decision.otHours)
            : null,
        reconcile_is_from_ocr: decision.isFromOcr,
      });
    }

    if (createInputs.length > 0) {
      await this.prisma.aiPayrollReconcileItem.createMany({ data: createInputs });
    }
    await this.questionService.createQuestions(sessionId, allQuestions);

    const needsReview = allQuestions.some(
      (question) => question.severity === 'critical' || question.severity === 'warning',
    );
    const result = {
      total: createInputs.length,
      questions: allQuestions.length,
      needsReview,
    };
    await this.prisma.aiPayrollSession.update({
      where: { id: sessionId },
      data: {
        session_current_step: 4,
        session_status: needsReview ? 'needs_review' : 'completed',
        session_reconcile_result: result as Prisma.InputJsonValue,
      },
    });
    return result;
  }

  async listSources(sessionId: number, query: QuerySourcesDto) {
    await this.getSessionContext(sessionId);
    return this.prisma.aiPayrollSourceRecord.findMany({
      where: {
        source_record_session_id: sessionId,
        ...(query.employee_id
          ? { source_record_employee_id: query.employee_id }
          : {}),
        ...(query.date ? { source_record_date: new Date(query.date) } : {}),
        ...(query.source_type
          ? { source_record_source_type: query.source_type }
          : {}),
      },
      orderBy: [
        { source_record_employee_id: 'asc' },
        { source_record_date: 'asc' },
        { source_record_source_type: 'asc' },
      ],
    });
  }

  async getSourcesSummary(sessionId: number): Promise<SourceSummaryByEmployee[]> {
    await this.getSessionContext(sessionId);
    const sources = await this.prisma.aiPayrollSourceRecord.findMany({
      where: { source_record_session_id: sessionId },
      orderBy: [{ source_record_employee_id: 'asc' }, { source_record_date: 'asc' }],
    });
    const summary = new Map<number, SourceSummaryByEmployee>();
    for (const source of sources) {
      const data = this.asSourceData(source.source_record_data);
      const current = summary.get(source.source_record_employee_id) ?? {
        employee_id: source.source_record_employee_id,
        employee_name: data.employee_name ?? null,
        total: 0,
        by_source_type: {},
        dates: [],
      };
      current.total += 1;
      current.by_source_type[source.source_record_source_type] =
        (current.by_source_type[source.source_record_source_type] ?? 0) + 1;
      const date = this.toDateString(source.source_record_date);
      if (!current.dates.includes(date)) current.dates.push(date);
      summary.set(source.source_record_employee_id, current);
    }
    return [...summary.values()];
  }

  async listReconcileItems(sessionId: number, query: QueryReconcileItemsDto) {
    await this.getSessionContext(sessionId);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const where: Prisma.AiPayrollReconcileItemWhereInput = {
      reconcile_session_id: sessionId,
      ...(query.employee_id ? { reconcile_employee_id: query.employee_id } : {}),
      ...(query.status ? { reconcile_status: query.status } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.aiPayrollReconcileItem.findMany({
        where,
        include: { work_log: true },
        orderBy: [
          { reconcile_employee_id: 'asc' },
          { reconcile_date: 'asc' },
          { id: 'asc' },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.aiPayrollReconcileItem.count({ where }),
    ]);
    return { data, total, page, pageSize };
  }

  async getReconcileItem(sessionId: number, itemId: number) {
    const item = await this.prisma.aiPayrollReconcileItem.findFirst({
      where: { id: itemId, reconcile_session_id: sessionId },
      include: { work_log: true },
    });
    if (!item) throw new NotFoundException('核對項目不存在');
    const sources = await this.prisma.aiPayrollSourceRecord.findMany({
      where: {
        source_record_session_id: sessionId,
        source_record_employee_id: item.reconcile_employee_id,
        source_record_date: item.reconcile_date,
      },
      orderBy: { source_record_source_type: 'asc' },
    });
    return { ...item, sources };
  }

  async updateReconcileItem(
    sessionId: number,
    itemId: number,
    dto: UpdateReconcileItemDto,
    userId: number,
  ) {
    const item = await this.prisma.aiPayrollReconcileItem.findFirst({
      where: { id: itemId, reconcile_session_id: sessionId },
    });
    if (!item) throw new NotFoundException('核對項目不存在');
    const existingData = this.asSourceData(item.reconcile_decided_data);
    const decidedData: StandardizedSourceRecordData = {
      ...existingData,
      ...(dto.decided_data ?? {}),
    };
    const override = {
      userId,
      updatedAt: new Date().toISOString(),
      decided_data: dto.decided_data ?? null,
      work_type: dto.work_type ?? null,
      has_ot: dto.has_ot ?? null,
      ot_hours: dto.ot_hours ?? null,
      status: dto.status ?? null,
    };
    return this.prisma.aiPayrollReconcileItem.update({
      where: { id: itemId },
      data: {
        reconcile_decided_data: decidedData as unknown as Prisma.InputJsonValue,
        ...(dto.work_type !== undefined
          ? { reconcile_work_type: dto.work_type }
          : {}),
        ...(dto.has_ot !== undefined ? { reconcile_has_ot: dto.has_ot } : {}),
        ...(dto.ot_hours !== undefined
          ? { reconcile_ot_hours: new Prisma.Decimal(dto.ot_hours) }
          : {}),
        ...(dto.status !== undefined ? { reconcile_status: dto.status } : {}),
        reconcile_user_override: override as Prisma.InputJsonValue,
      },
    });
  }

  async batchConfirm(sessionId: number, dto: BatchConfirmReconcileDto) {
    await this.getSessionContext(sessionId);
    const result = await this.prisma.aiPayrollReconcileItem.updateMany({
      where: {
        reconcile_session_id: sessionId,
        id: { in: dto.item_ids },
      },
      data: { reconcile_status: 'confirmed' },
    });
    return { updated: result.count };
  }

  private async collectWorkLogSources(
    session: SessionContext,
  ): Promise<Prisma.AiPayrollSourceRecordCreateManyInput[]> {
    const workLogs = await this.prisma.workLog.findMany({
      where: {
        employee_id: { in: session.employeeIds },
        scheduled_date: { gte: session.dateFrom, lte: session.dateTo },
        deleted_at: null,
      },
      include: { employee: { select: { name_zh: true, name_en: true } } },
      orderBy: [{ employee_id: 'asc' }, { scheduled_date: 'asc' }],
    });

    return workLogs.flatMap((workLog) => {
      if (!workLog.employee_id || !workLog.scheduled_date) return [];
      const data: StandardizedSourceRecordData = {
        employee_id: workLog.employee_id,
        employee_name: workLog.employee?.name_zh ?? workLog.employee?.name_en ?? null,
        date: this.toDateString(workLog.scheduled_date),
        service_type: workLog.service_type,
        day_night: workLog.day_night,
        start_location: workLog.start_location,
        end_location: workLog.end_location,
        machine_type: workLog.machine_type,
        tonnage: workLog.tonnage,
        equipment_number: workLog.equipment_number,
        quantity: this.decimalToNumber(workLog.quantity),
        unit: workLog.unit,
        start_time: workLog.start_time,
        end_time: workLog.end_time,
        ot_quantity: this.decimalToNumber(workLog.ot_quantity),
        ot_unit: workLog.ot_unit,
        is_mid_shift: workLog.is_mid_shift,
        work_content: workLog.work_content,
        client_name: workLog.unverified_client_name,
        contract_no: workLog.client_contract_no,
        remarks: workLog.remarks,
      };
      return [
        {
          source_record_session_id: session.id,
          source_record_employee_id: workLog.employee_id,
          source_record_date: workLog.scheduled_date,
          source_record_source_type: this.normalizeWorkLogSource(workLog.source),
          source_record_source_id: workLog.id,
          source_record_data: data as unknown as Prisma.InputJsonValue,
          source_record_raw_data: this.toJson(workLog.ai_parsed_data),
          source_record_confidence: new Prisma.Decimal(90),
        },
      ];
    });
  }

  private async collectOcrSources(
    session: SessionContext,
  ): Promise<Prisma.AiPayrollSourceRecordCreateManyInput[]> {
    const entries = await this.prisma.aiPayrollEntry.findMany({
      where: {
        entry_employee_id: { in: session.employeeIds },
        entry_work_date: { gte: session.dateFrom, lte: session.dateTo },
        page: { document: { batch: { batch_session_id: session.id } } },
      },
      include: {
        fields: true,
      },
      orderBy: [{ entry_employee_id: 'asc' }, { entry_work_date: 'asc' }],
    });

    return entries.flatMap((entry) => {
      if (!entry.entry_employee_id || !entry.entry_work_date) return [];
      const data = this.entryFieldsToSourceData(entry.entry_employee_id, entry.entry_work_date, entry.entry_employee_name_raw, entry.fields);
      return [
        {
          source_record_session_id: session.id,
          source_record_employee_id: entry.entry_employee_id,
          source_record_date: entry.entry_work_date,
          source_record_source_type: 'homework_sheet',
          source_record_source_id: entry.id,
          source_record_data: data as unknown as Prisma.InputJsonValue,
          source_record_raw_data: this.toJson(entry.entry_flags),
          source_record_confidence: entry.entry_overall_confidence,
        },
      ];
    });
  }

  private async decideGroup(
    group: SourceRecordRow[],
  ): Promise<ReconcileDecisionResult> {
    const first = this.asSourceData(group[0].source_record_data);
    const comparison = this.buildComparison(group);
    const decidedData = this.voteSourceData(group);
    const aiHint = await this.getAiHint(group, decidedData);
    const knowledgeHint = await this.findKnowledgeHint(decidedData);

    const finalWorkType = aiHint.workType ?? this.detectWorkType(decidedData);
    const otHours = this.decideOtHours(group);
    const hasOt = otHours > 0;
    const questions: ReconcileQuestionDraft[] = [];

    if (comparison.conflicted_fields.includes('start_location') || comparison.conflicted_fields.includes('end_location')) {
      const sameLocation = aiHint.sameLocation === true;
      questions.push({
        employeeId: first.employee_id,
        date: first.date,
        type: sameLocation ? 'ocr_error' : 'location_conflict',
        severity: sameLocation ? 'info' : 'warning',
        text: sameLocation
          ? '多個來源地點名稱不同但 AI 判斷可能是同一地點，請抽查確認。'
          : '多個來源的起訖地點不一致，AI 已先按多數來源決定。',
        context: { sourceIds: group.map((source) => source.id), knowledgeHint },
        aiDecision: aiHint.reason ?? '已根據多數來源與語意判斷選擇地點。',
        aiAction: { field: 'location', confidence: aiHint.confidence ?? 60 },
      });
    }

    if (this.hasOtConflict(group)) {
      questions.push({
        employeeId: first.employee_id,
        date: first.date,
        type: 'ot_conflict',
        severity: 'warning',
        text: '員工或 OCR 來源顯示加班，但工時來源未能完全支持，請確認 OT。',
        context: { sourceIds: group.map((source) => source.id) },
        aiDecision: hasOt ? `暫定 OT ${otHours} 小時。` : '暫定無 OT。',
        aiAction: { field: 'ot_hours', value: otHours, confidence: 60 },
      });
    }

    if (!finalWorkType || finalWorkType === 'unknown') {
      questions.push({
        employeeId: first.employee_id,
        date: first.date,
        type: 'work_type_uncertain',
        severity: 'warning',
        text: '未能可靠判斷工種，AI 仍已根據內容暫作決定，請覆核。',
        context: { decidedData, sourceTypes: comparison.source_types },
        aiDecision: '暫定為 worker。',
        aiAction: { field: 'work_type', value: 'worker', confidence: 50 },
      });
    }

    const status = questions.some((question) => question.severity !== 'info')
      ? 'needs_review'
      : comparison.conflicted_fields.length > 0
        ? 'conflict'
        : 'matched';

    return {
      status,
      decidedData: {
        ...decidedData,
        employee_id: first.employee_id,
        date: first.date,
        work_type_decided: finalWorkType ?? 'worker',
        decision_method:
          comparison.conflicted_fields.length > 0 ? 'majority_vote_ai_assisted' : 'source_consensus',
        sources_agreed: comparison.source_types.filter(
          (sourceType) => !comparison.missing_fields.includes(sourceType),
        ),
        sources_disagreed: comparison.conflicted_fields.length > 0 ? comparison.source_types : [],
      },
      comparison,
      decisionReason: aiHint.reason ?? '按同日同員工多來源資料進行多數決與規則判斷。',
      workType: finalWorkType ?? 'worker',
      hasOt,
      otHours,
      isFromOcr: group.some((source) => source.source_record_source_type === 'homework_sheet'),
      questions,
    };
  }

  private buildComparison(group: SourceRecordRow[]): ReconcileSourceComparison {
    const fields: (keyof StandardizedSourceRecordData)[] = [
      'service_type',
      'day_night',
      'start_location',
      'end_location',
      'machine_type',
      'equipment_number',
      'quantity',
      'unit',
      'ot_quantity',
      'work_content',
    ];
    const agreed: string[] = [];
    const conflicted: string[] = [];
    const missing: string[] = [];
    for (const field of fields) {
      const values = group
        .map((source) => this.asSourceData(source.source_record_data)[field])
        .filter((value) => value !== null && value !== undefined && `${value}`.trim() !== '')
        .map((value) => `${value}`.trim());
      const uniqueValues = new Set(values);
      if (values.length === 0) missing.push(field);
      else if (uniqueValues.size === 1) agreed.push(field);
      else conflicted.push(field);
    }
    return {
      source_count: group.length,
      source_types: [...new Set(group.map((source) => source.source_record_source_type))],
      agreed_fields: agreed,
      conflicted_fields: conflicted,
      missing_fields: missing,
    };
  }

  private voteSourceData(group: SourceRecordRow[]): StandardizedSourceRecordData {
    const first = this.asSourceData(group[0].source_record_data);
    const fields: (keyof StandardizedSourceRecordData)[] = [
      'employee_name',
      'service_type',
      'day_night',
      'start_location',
      'end_location',
      'machine_type',
      'tonnage',
      'equipment_number',
      'quantity',
      'unit',
      'start_time',
      'end_time',
      'ot_quantity',
      'ot_unit',
      'is_mid_shift',
      'work_content',
      'client_name',
      'contract_no',
      'remarks',
    ];
    const decided: StandardizedSourceRecordData = {
      employee_id: first.employee_id,
      employee_name: first.employee_name ?? null,
      date: first.date,
    };
    for (const field of fields) {
      const winner = this.getFieldWinner(group, field);
      if (winner !== undefined) {
        Object.assign(decided, { [field]: winner });
      }
    }
    return decided;
  }

  private getFieldWinner(
    group: SourceRecordRow[],
    field: keyof StandardizedSourceRecordData,
  ): string | number | boolean | null | undefined {
    const votes = new Map<string, FieldVote>();
    for (const source of group) {
      const rawValue = this.asSourceData(source.source_record_data)[field];
      if (
        rawValue === undefined ||
        rawValue === null ||
        (typeof rawValue !== 'string' &&
          typeof rawValue !== 'number' &&
          typeof rawValue !== 'boolean')
      ) {
        continue;
      }
      const value = rawValue;
      if (`${value}`.trim() === '') continue;
      const key = `${value}`.trim();
      const vote: FieldVote = votes.get(key) ?? {
        value,
        count: 0,
        sourceTypes: [],
      };
      vote.count += this.sourceWeight(source.source_record_source_type);
      vote.sourceTypes.push(source.source_record_source_type);
      votes.set(key, vote);
    }
    const sorted = [...votes.values()].sort((left, right) => right.count - left.count);
    return sorted[0]?.value;
  }

  private async getAiHint(
    group: SourceRecordRow[],
    decidedData: StandardizedSourceRecordData,
  ): Promise<AiReconcileHint> {
    if (!process.env.OPENAI_API_KEY) return { workType: this.detectWorkType(decidedData), confidence: 50 };
    try {
      const prompt = JSON.stringify({
        instruction:
          '判斷多個香港地盤/工作紀錄是否指同一工作、是否存在 OCR 錯誤，並從內容判斷工種。只回傳 JSON。',
        decidedData,
        sources: group.map((source) => ({
          sourceType: source.source_record_source_type,
          data: this.asSourceData(source.source_record_data),
        })),
      });
      const response = await this.openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              '你是香港工程公司 AI 計糧核對助手。請根據車牌、機械編號、工作內容、地點語意與來源可信度作判斷。',
          },
          { role: 'user', content: prompt },
        ],
      });
      const content = response.choices[0]?.message?.content ?? '{}';
      const parsed = JSON.parse(content) as AiReconcileHint;
      return {
        sameLocation: parsed.sameLocation,
        workType: parsed.workType ?? this.detectWorkType(decidedData),
        confidence: parsed.confidence,
        reason: parsed.reason,
      };
    } catch (error) {
      this.logger.warn(`AI reconciliation hint failed: ${error instanceof Error ? error.message : String(error)}`);
      return { workType: this.detectWorkType(decidedData), confidence: 40 };
    }
  }

  private async findKnowledgeHint(
    data: StandardizedSourceRecordData,
  ): Promise<Record<string, unknown> | null> {
    const keywords = [
      data.start_location,
      data.end_location,
      data.machine_type,
      data.equipment_number,
      data.work_content,
    ].filter((value): value is string => Boolean(value));
    if (keywords.length === 0) return null;
    const entry = await this.prisma.aiKnowledgeEntry.findFirst({
      where: {
        knowledge_status: { in: ['approved', 'active'] },
        OR: keywords.map((keyword) => ({
          knowledge_title: { contains: keyword, mode: 'insensitive' },
        })),
      },
      orderBy: [{ knowledge_usage_count: 'desc' }, { updated_at: 'desc' }],
    });
    if (!entry) return null;
    return {
      id: entry.id,
      title: entry.knowledge_title,
      payload: entry.knowledge_payload_json,
    };
  }

  private decideOtHours(group: SourceRecordRow[]): number {
    const values = group
      .map((source) => this.asSourceData(source.source_record_data).ot_quantity)
      .filter((value): value is number => typeof value === 'number' && value > 0);
    return values.length > 0 ? Math.max(...values) : 0;
  }

  private hasOtConflict(group: SourceRecordRow[]): boolean {
    const values = group.map((source) => this.asSourceData(source.source_record_data).ot_quantity ?? 0);
    const positive = values.some((value) => value > 0);
    const zero = values.some((value) => value === 0);
    return positive && zero;
  }

  private detectWorkType(data: StandardizedSourceRecordData): string {
    const content = [
      data.service_type,
      data.machine_type,
      data.equipment_number,
      data.work_content,
      data.remarks,
    ]
      .filter((value): value is string => Boolean(value))
      .join(' ')
      .toLowerCase();
    if (/車|truck|lorry|plate|車牌|司機|driver|運泥|運輸/.test(content)) return 'driver';
    if (/機|挖機|吊機|operator|machine|excavator|crane|dc\d+/i.test(content)) return 'operator';
    if (/工人|雜工|worker|construction|地盤|清理|施工/.test(content)) return 'worker';
    return 'worker';
  }

  private groupSources(sources: SourceRecordRow[]): Map<string, SourceRecordRow[]> {
    const grouped = new Map<string, SourceRecordRow[]>();
    for (const source of sources) {
      const key = `${source.source_record_employee_id}:${this.toDateString(source.source_record_date)}`;
      const items = grouped.get(key) ?? [];
      items.push(source);
      grouped.set(key, items);
    }
    return grouped;
  }

  private findWorkLogId(group: SourceRecordRow[]): number | null {
    const source = group.find((item) => item.source_record_source_type === 'work_log');
    return source?.source_record_source_id ?? null;
  }

  private entryFieldsToSourceData(
    employeeId: number,
    date: Date,
    employeeName: string | null,
    fields: Prisma.AiPayrollEntryFieldGetPayload<Record<string, never>>[],
  ): StandardizedSourceRecordData {
    const fieldMap = new Map<string, string>();
    for (const field of fields) {
      const value = field.field_confirmed_value ?? field.field_normalized_value ?? field.field_raw_text;
      if (value !== null && value !== undefined) fieldMap.set(field.field_name, value);
    }
    return {
      employee_id: employeeId,
      employee_name: employeeName,
      date: this.toDateString(date),
      service_type: this.readMappedField(fieldMap, ['service_type', '服務', '工種']),
      day_night: this.readMappedField(fieldMap, ['day_night', '更份', '日夜']),
      start_location: this.readMappedField(fieldMap, ['start_location', 'from', '起點', '上車地點']),
      end_location: this.readMappedField(fieldMap, ['end_location', 'to', '終點', '落車地點']),
      machine_type: this.readMappedField(fieldMap, ['machine_type', '機械', '機種']),
      tonnage: this.readMappedField(fieldMap, ['tonnage', '噸數']),
      equipment_number: this.readMappedField(fieldMap, ['equipment_number', 'vehicle_no', '車牌', '機號']),
      quantity: this.parseNumber(this.readMappedField(fieldMap, ['quantity', '數量'])),
      unit: this.readMappedField(fieldMap, ['unit', '單位']),
      start_time: this.readMappedField(fieldMap, ['start_time', '開始時間']),
      end_time: this.readMappedField(fieldMap, ['end_time', '結束時間']),
      ot_quantity: this.parseNumber(this.readMappedField(fieldMap, ['ot_quantity', 'ot_hours', '加班'])),
      ot_unit: this.readMappedField(fieldMap, ['ot_unit', '加班單位']),
      is_mid_shift: this.readMappedField(fieldMap, ['is_mid_shift', '中更']) === 'true',
      work_content: this.readMappedField(fieldMap, ['work_content', '工作內容', 'description']),
      client_name: this.readMappedField(fieldMap, ['client_name', '客戶']),
      contract_no: this.readMappedField(fieldMap, ['contract_no', '合約']),
      remarks: this.readMappedField(fieldMap, ['remarks', '備註']),
    };
  }

  private readMappedField(fieldMap: Map<string, string>, names: string[]): string | null {
    for (const name of names) {
      const value = fieldMap.get(name);
      if (value !== undefined && value.trim() !== '') return value.trim();
    }
    return null;
  }

  private async getSessionContext(sessionId: number): Promise<SessionContext> {
    const session = await this.prisma.aiPayrollSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException('AI 計糧會話不存在');
    return {
      id: session.id,
      companyId: session.session_company_id,
      dateFrom: session.session_date_from,
      dateTo: session.session_date_to,
      employeeIds: this.parseEmployeeIds(session.session_employee_ids),
    };
  }

  private parseEmployeeIds(value: Prisma.JsonValue): number[] {
    if (!Array.isArray(value)) return [];
    return value.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0);
  }

  private asSourceData(value: Prisma.JsonValue): StandardizedSourceRecordData {
    const object = typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {};
    const record = object as Record<string, unknown>;
    return {
      employee_id: Number(record.employee_id ?? 0),
      employee_name: this.stringOrNull(record.employee_name),
      date: String(record.date ?? ''),
      service_type: this.stringOrNull(record.service_type),
      day_night: this.stringOrNull(record.day_night),
      start_location: this.stringOrNull(record.start_location),
      end_location: this.stringOrNull(record.end_location),
      machine_type: this.stringOrNull(record.machine_type),
      tonnage: this.stringOrNull(record.tonnage),
      equipment_number: this.stringOrNull(record.equipment_number),
      quantity: typeof record.quantity === 'number' ? record.quantity : this.parseNumber(this.stringOrNull(record.quantity)),
      unit: this.stringOrNull(record.unit),
      start_time: this.stringOrNull(record.start_time),
      end_time: this.stringOrNull(record.end_time),
      ot_quantity: typeof record.ot_quantity === 'number' ? record.ot_quantity : this.parseNumber(this.stringOrNull(record.ot_quantity)),
      ot_unit: this.stringOrNull(record.ot_unit),
      is_mid_shift: typeof record.is_mid_shift === 'boolean' ? record.is_mid_shift : false,
      work_content: this.stringOrNull(record.work_content),
      client_name: this.stringOrNull(record.client_name),
      contract_no: this.stringOrNull(record.contract_no),
      remarks: this.stringOrNull(record.remarks),
    };
  }

  private normalizeWorkLogSource(source: string): AiPayrollSourceType {
    if (source === 'attendance') return 'attendance';
    if (source === 'whatsapp_clockin' || source === 'employee_portal') return 'whatsapp_order';
    return 'work_log';
  }

  private sourceWeight(sourceType: string): number {
    if (sourceType === 'work_log') return 3;
    if (sourceType === 'attendance') return 2;
    if (sourceType === 'homework_sheet') return 2;
    return 1;
  }

  private decimalToNumber(value: Prisma.Decimal | null): number | null {
    return value === null ? null : Number(value);
  }

  private parseNumber(value: string | null): number | null {
    if (!value) return null;
    const cleaned = value.replace(/[^0-9.\-]/g, '');
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private stringOrNull(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const stringValue = String(value).trim();
    return stringValue ? stringValue : null;
  }

  private toDateString(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private toJson(value: unknown): Prisma.InputJsonValue | undefined {
    if (value === undefined || value === null) return undefined;
    return value as Prisma.InputJsonValue;
  }
}
