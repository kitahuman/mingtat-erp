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
import { WhatsappService } from '../verification/whatsapp.service';

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

type OcrEntryWithFields = Prisma.AiPayrollEntryGetPayload<{ include: { fields: true } }>;

type OcrEmployeeMatcher = {
  nameById: Map<number, string>;
  idByExactName: Map<string, number>;
  candidates: Array<{ id: number; names: string[] }>;
};

type NormalizedOcrEntry = {
  entry: OcrEntryWithFields;
  employeeId: number | null;
  employeeName: string | null;
  employeeMatchBasis: string;
  workDate: Date | null;
  rawWorkDate: Date | null;
  yearCorrected: boolean;
  rawYear: number | null;
  correctedYear: number | null;
  lowConfidence: boolean;
};

type DocumentOcrWarning = {
  code: string;
  message: string;
  severity: 'warning';
  document_ids?: number[];
};

type DocumentOcrSummary = {
  total_documents: number;
  total_pages: number;
  extracted_pages: number;
  failed_pages: number;
  pending_pages: number;
  processing_pages: number;
  total_entries: number;
  documents_without_entries: number[];
  documents_with_failed_pages: number[];
  warnings: DocumentOcrWarning[];
};

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
    private readonly whatsappService: WhatsappService,
  ) {}

  async collectSources(sessionId: number) {
    const session = await this.getSessionContext(sessionId);
    await this.prisma.aiPayrollSourceRecord.deleteMany({
      where: { source_record_session_id: sessionId },
    });

    const records: Prisma.AiPayrollSourceRecordCreateManyInput[] = [];
    records.push(...(await this.collectWorkLogSources(session)));
    records.push(...(await this.collectOcrSources(session)));
    records.push(...(await this.collectClockSources(session)));
    records.push(...(await this.collectWhatsappOrderSources(session)));
    records.push(...(await this.collectReceiptSources(session)));
    records.push(...(await this.collectGpsSources(session)));

    if (records.length > 0) {
      await this.prisma.aiPayrollSourceRecord.createMany({ data: records });
    }

    const summary = await this.getSourcesSummary(sessionId);
    const documentOcr = await this.buildDocumentOcrSummary(sessionId);
    await this.prisma.aiPayrollSession.update({
      where: { id: sessionId },
      data: {
        session_sources_summary: {
          employees: summary,
          document_ocr: documentOcr,
          warnings: documentOcr.warnings,
          generated_at: new Date().toISOString(),
        } as unknown as Prisma.InputJsonValue,
        session_current_step: 2,
      },
    });
    return { inserted: records.length, summary, document_ocr: documentOcr };
  }

  async reconcile(sessionId: number) {
    const session = await this.getSessionContext(sessionId);
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
    const allQuestions: ReconcileQuestionDraft[] = await this.collectOcrQualityQuestions(session);
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

  private async buildDocumentOcrSummary(sessionId: number): Promise<DocumentOcrSummary> {
    const documents = await this.prisma.aiPayrollDocument.findMany({
      where: { batch: { batch_session_id: sessionId } },
      include: {
        pages: {
          include: {
            entries: { select: { id: true } },
          },
        },
      },
      orderBy: { id: 'asc' },
    });

    const summary: DocumentOcrSummary = {
      total_documents: documents.length,
      total_pages: 0,
      extracted_pages: 0,
      failed_pages: 0,
      pending_pages: 0,
      processing_pages: 0,
      total_entries: 0,
      documents_without_entries: [],
      documents_with_failed_pages: [],
      warnings: [],
    };

    for (const document of documents) {
      const pages = document.pages ?? [];
      const entryCount = pages.reduce(
        (count, page) => count + (page.entries?.length ?? 0),
        0,
      );
      const failedPages = pages.filter((page) => page.page_status === 'failed');
      summary.total_pages += pages.length;
      summary.extracted_pages += pages.filter((page) => page.page_status === 'extracted').length;
      summary.failed_pages += failedPages.length;
      summary.pending_pages += pages.filter((page) => page.page_status === 'pending').length;
      summary.processing_pages += pages.filter((page) => page.page_status === 'processing').length;
      summary.total_entries += entryCount;
      if (pages.length > 0 && entryCount === 0 && failedPages.length > 0) {
        summary.documents_without_entries.push(document.id);
      }
      if (failedPages.length > 0) summary.documents_with_failed_pages.push(document.id);
    }

    if (summary.total_documents > 0 && summary.failed_pages > 0) {
      summary.warnings.push({
        code: 'document_ocr_failed',
        message: '部分文件未能讀取',
        severity: 'warning',
        document_ids: summary.documents_with_failed_pages,
      });
    }

    if (
      summary.total_documents > 0 &&
      summary.total_entries === 0 &&
      (summary.failed_pages > 0 || summary.extracted_pages > 0)
    ) {
      summary.warnings.push({
        code: 'document_ocr_no_records',
        message: 'AI 未能從上載文件中讀取資料，核對將使用其他來源（工作紀錄、打卡等）',
        severity: 'warning',
      });
    }

    return summary;
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
    const normalizedEntries = await this.getNormalizedOcrEntries(session);

    return normalizedEntries.flatMap((normalized) => {
      const { entry, employeeId, employeeName, workDate } = normalized;
      if (!employeeId || !workDate) return [];

      const data = this.entryFieldsToSourceData(employeeId, workDate, employeeName, entry.fields);
      data.source_label = 'OCR 工紙';
      data.source_status = 'found';
      data.match_basis = normalized.employeeMatchBasis;
      data.raw_summary = [entry.entry_employee_name_raw, this.toDateString(workDate), entry.entry_form_type]
        .filter(Boolean)
        .join(' / ') || null;

      return [
        {
          source_record_session_id: session.id,
          source_record_employee_id: employeeId,
          source_record_date: workDate,
          source_record_source_type: 'homework_sheet',
          source_record_source_id: entry.id,
          source_record_data: data as unknown as Prisma.InputJsonValue,
          source_record_raw_data: this.toJson(this.buildOcrRawData(normalized)),
          source_record_confidence: entry.entry_overall_confidence ?? undefined,
        },
      ];
    });
  }

  private async getNormalizedOcrEntries(session: SessionContext): Promise<NormalizedOcrEntry[]> {
    const [entries, employeeMatcher] = await Promise.all([
      this.prisma.aiPayrollEntry.findMany({
        where: {
          page: { document: { batch: { batch_session_id: session.id } } },
        },
        include: {
          fields: true,
        },
        orderBy: [{ entry_employee_id: 'asc' }, { entry_work_date: 'asc' }],
      }),
      this.buildCompanyEmployeeMatcher(session.companyId),
    ]);

    return entries.map((entry) => {
      const dateResult = this.correctOcrWorkDateYear(entry, session);
      const employeeMatch = this.matchOcrEntryEmployee(entry, employeeMatcher);
      const confidence = this.decimalLikeToNumber(entry.entry_overall_confidence);
      return {
        entry,
        employeeId: employeeMatch.employeeId,
        employeeName: employeeMatch.employeeName,
        employeeMatchBasis: employeeMatch.matchBasis,
        workDate: dateResult.workDate,
        rawWorkDate: dateResult.rawWorkDate,
        yearCorrected: dateResult.yearCorrected,
        rawYear: dateResult.rawYear,
        correctedYear: dateResult.correctedYear,
        lowConfidence: confidence !== null && confidence < 70,
      };
    });
  }

  private async collectOcrQualityQuestions(session: SessionContext): Promise<ReconcileQuestionDraft[]> {
    const normalizedEntries = await this.getNormalizedOcrEntries(session);
    const questions: ReconcileQuestionDraft[] = [];

    for (const normalized of normalizedEntries) {
      const { entry, employeeId, workDate } = normalized;
      const questionDate = workDate ? this.toDateString(workDate) : null;
      const baseContext = this.buildOcrQuestionContext(normalized);

      if (!employeeId && entry.entry_employee_name_raw) {
        questions.push({
          employeeId: null,
          date: questionDate,
          type: 'ocr_employee_unmatched',
          severity: 'warning',
          text: `OCR 讀取到員工名稱「${entry.entry_employee_name_raw}」但無法匹配系統員工，請確認。`,
          context: baseContext,
          aiDecision: '未建立工紙來源紀錄，避免將 OCR 資料錯配至錯誤員工。',
          aiAction: { field: 'employee_id', value: null, confidence: 40 },
        });
      }

      if (normalized.yearCorrected && normalized.rawYear !== null && normalized.correctedYear !== null) {
        questions.push({
          employeeId,
          date: questionDate,
          type: 'ocr_date_corrected',
          severity: 'warning',
          text: `OCR 讀取日期年份異常（讀取為 ${normalized.rawYear}，已自動修正為 ${normalized.correctedYear}），請確認。`,
          context: baseContext,
          aiDecision: `已按會話期間年份 ${normalized.correctedYear} 修正 OCR 工紙日期。`,
          aiAction: {
            field: 'entry_work_date',
            value: questionDate,
            confidence: 80,
            reason: 'OCR 日期年份與會話年份不一致。',
          },
        });
      }

      if (normalized.lowConfidence) {
        const confidence = this.decimalLikeToNumber(entry.entry_overall_confidence);
        questions.push({
          employeeId,
          date: questionDate,
          type: 'ocr_error',
          severity: 'warning',
          text: `OCR 讀取信心度偏低（${confidence ?? '未知'}），請抽查原始文件。`,
          context: baseContext,
          aiDecision: '已保留 OCR 來源紀錄（如已匹配員工及日期），但建議人工覆核。',
          aiAction: { field: 'ocr_confidence', value: confidence, confidence: confidence ?? 0 },
        });
      }
    }

    return questions;
  }

  private correctOcrWorkDateYear(
    entry: OcrEntryWithFields,
    session: SessionContext,
  ): {
    workDate: Date | null;
    rawWorkDate: Date | null;
    yearCorrected: boolean;
    rawYear: number | null;
    correctedYear: number | null;
  } {
    if (!entry.entry_work_date) {
      return { workDate: null, rawWorkDate: null, yearCorrected: false, rawYear: null, correctedYear: null };
    }

    const rawWorkDate = this.toDateOnly(entry.entry_work_date);
    const sessionYear = session.dateFrom.getUTCFullYear();
    const rawYear = rawWorkDate.getUTCFullYear();
    if (rawYear === sessionYear) {
      return { workDate: rawWorkDate, rawWorkDate, yearCorrected: false, rawYear, correctedYear: sessionYear };
    }

    const correctedDate = new Date(Date.UTC(sessionYear, rawWorkDate.getUTCMonth(), rawWorkDate.getUTCDate()));
    this.logger.warn(
      `OCR entry ${entry.id} work date year ${rawYear} does not match session ${session.id} year ${sessionYear}; auto-corrected to ${this.toDateString(correctedDate)}.`,
    );
    return { workDate: correctedDate, rawWorkDate, yearCorrected: true, rawYear, correctedYear: sessionYear };
  }

  private matchOcrEntryEmployee(
    entry: OcrEntryWithFields,
    employeeMatcher: OcrEmployeeMatcher,
  ): { employeeId: number | null; employeeName: string | null; matchBasis: string } {
    if (entry.entry_employee_id) {
      return {
        employeeId: entry.entry_employee_id,
        employeeName: employeeMatcher.nameById.get(entry.entry_employee_id) ?? entry.entry_employee_name_raw ?? null,
        matchBasis: 'entry_employee_id',
      };
    }

    const rawName = entry.entry_employee_name_raw;
    const normalizedName = this.normalizeText(rawName);
    if (!normalizedName) {
      return { employeeId: null, employeeName: rawName ?? null, matchBasis: 'unmatched' };
    }

    const exactEmployeeId = employeeMatcher.idByExactName.get(normalizedName);
    if (exactEmployeeId) {
      return {
        employeeId: exactEmployeeId,
        employeeName: employeeMatcher.nameById.get(exactEmployeeId) ?? rawName ?? null,
        matchBasis: 'employee_name_exact',
      };
    }

    for (const candidate of employeeMatcher.candidates) {
      if (
        candidate.names.some(
          (candidateName) =>
            candidateName.length >= 2 &&
            normalizedName.length >= 2 &&
            (candidateName.includes(normalizedName) || normalizedName.includes(candidateName)),
        )
      ) {
        return {
          employeeId: candidate.id,
          employeeName: employeeMatcher.nameById.get(candidate.id) ?? rawName ?? null,
          matchBasis: 'employee_name_contains',
        };
      }
    }

    return { employeeId: null, employeeName: rawName ?? null, matchBasis: 'unmatched' };
  }

  private async buildCompanyEmployeeMatcher(companyId: number): Promise<OcrEmployeeMatcher> {
    const employees = await this.prisma.employee.findMany({
      where: { company_id: companyId },
      select: { id: true, name_zh: true, name_en: true, nickname: true, emp_code: true },
    });
    const employeeIds = employees.map((employee) => employee.id);
    const nicknames = employeeIds.length > 0
      ? await this.prisma.employeeNickname.findMany({
        where: { emp_nickname_employee_id: { in: employeeIds } },
        select: { emp_nickname_employee_id: true, emp_nickname_value: true },
      })
      : [];

    const nameById = new Map<number, string>();
    const idByExactName = new Map<string, number>();
    const candidateNameMap = new Map<number, Set<string>>();
    const addName = (employeeId: number, value: string | null | undefined) => {
      const normalized = this.normalizeText(value);
      if (!normalized) return;
      if (!idByExactName.has(normalized)) idByExactName.set(normalized, employeeId);
      const names = candidateNameMap.get(employeeId) ?? new Set<string>();
      names.add(normalized);
      candidateNameMap.set(employeeId, names);
    };

    for (const employee of employees) {
      nameById.set(employee.id, employee.name_zh ?? employee.name_en ?? employee.nickname ?? employee.emp_code ?? `#${employee.id}`);
      addName(employee.id, employee.name_zh);
      addName(employee.id, employee.name_en);
      addName(employee.id, employee.nickname);
      addName(employee.id, employee.emp_code);
    }
    for (const nickname of nicknames) {
      addName(nickname.emp_nickname_employee_id, nickname.emp_nickname_value);
    }

    return {
      nameById,
      idByExactName,
      candidates: [...candidateNameMap.entries()].map(([id, names]) => ({ id, names: [...names] })),
    };
  }

  private buildOcrQuestionContext(normalized: NormalizedOcrEntry): Record<string, unknown> {
    return this.buildOcrRawData(normalized) as Record<string, unknown>;
  }

  private buildOcrRawData(normalized: NormalizedOcrEntry): Record<string, unknown> {
    const { entry } = normalized;
    return {
      entry_id: entry.id,
      entry_page_id: entry.entry_page_id,
      entry_run_id: entry.entry_run_id,
      entry_row_number: entry.entry_row_number,
      raw_employee_id: entry.entry_employee_id,
      raw_employee_name: entry.entry_employee_name_raw,
      matched_employee_id: normalized.employeeId,
      matched_employee_name: normalized.employeeName,
      employee_match_basis: normalized.employeeMatchBasis,
      raw_work_date: normalized.rawWorkDate ? this.toDateString(normalized.rawWorkDate) : null,
      corrected_work_date: normalized.workDate ? this.toDateString(normalized.workDate) : null,
      year_corrected: normalized.yearCorrected,
      raw_year: normalized.rawYear,
      corrected_year: normalized.correctedYear,
      entry_form_type: entry.entry_form_type,
      entry_status: entry.entry_status,
      entry_overall_confidence: this.decimalLikeToNumber(entry.entry_overall_confidence),
      entry_flags: entry.entry_flags,
      fields: entry.fields.map((field) => ({
        field_name: field.field_name,
        field_raw_text: field.field_raw_text,
        field_normalized_value: field.field_normalized_value,
        field_confirmed_value: field.field_confirmed_value,
        field_confidence: this.decimalLikeToNumber(field.field_confidence),
      })),
    };
  }

  private async collectClockSources(
    session: SessionContext,
  ): Promise<Prisma.AiPayrollSourceRecordCreateManyInput[]> {
    const attendances = await this.prisma.employeeAttendance.findMany({
      where: {
        employee_id: { in: session.employeeIds },
        timestamp: { gte: session.dateFrom, lt: this.nextDay(session.dateTo) },
      },
      include: {
        employee: { select: { id: true, name_zh: true, name_en: true, nickname: true, emp_code: true } },
      },
      orderBy: [{ employee_id: 'asc' }, { timestamp: 'asc' }],
    });

    return attendances.map((attendance) => {
      const date = this.toDateOnly(attendance.timestamp);
      const data: StandardizedSourceRecordData = {
        employee_id: attendance.employee_id,
        employee_name:
          attendance.employee?.name_zh ?? attendance.employee?.name_en ?? attendance.employee?.nickname ?? null,
        date: this.toDateString(date),
        start_time: attendance.type === 'clock_in' ? attendance.timestamp.toISOString() : null,
        end_time: attendance.type === 'clock_out' ? attendance.timestamp.toISOString() : null,
        start_location: attendance.address ?? null,
        work_content: attendance.work_notes ?? attendance.remarks ?? null,
        source_label: '打卡紀錄',
        source_status: 'found',
        match_basis: 'employee_id + date',
        raw_summary: `${attendance.type === 'clock_in' ? '上班' : attendance.type === 'clock_out' ? '下班' : attendance.type} ${attendance.timestamp.toISOString()}${attendance.address ? ` @ ${attendance.address}` : ''}`,
      };
      return {
        source_record_session_id: session.id,
        source_record_employee_id: attendance.employee_id,
        source_record_date: date,
        source_record_source_type: 'clock',
        source_record_source_id: attendance.id,
        source_record_data: data as unknown as Prisma.InputJsonValue,
        source_record_raw_data: this.toJson({
          id: attendance.id,
          employee_id: attendance.employee_id,
          employee_name: data.employee_name,
          type: attendance.type,
          timestamp: attendance.timestamp.toISOString(),
          address: attendance.address,
          latitude: attendance.latitude,
          longitude: attendance.longitude,
          verification_method: attendance.attendance_verification_method,
          verification_score: attendance.attendance_verification_score,
          is_mid_shift: attendance.is_mid_shift,
          work_notes: attendance.work_notes,
          remarks: attendance.remarks,
        }),
        source_record_confidence:
          attendance.attendance_verification_score === null || attendance.attendance_verification_score === undefined
            ? undefined
            : new Prisma.Decimal(Math.min(100, Math.max(0, attendance.attendance_verification_score))),
      };
    });
  }

  private async collectWhatsappOrderSources(
    session: SessionContext,
  ): Promise<Prisma.AiPayrollSourceRecordCreateManyInput[]> {
    const [items, employeeMatcher, workLogVehicleEmployeeMap] = await Promise.all([
      this.whatsappService.getDailySummaryItemsForMatching(session.dateFrom, session.dateTo),
      this.buildEmployeeMatcher(session.employeeIds),
      this.buildWorkLogVehicleEmployeeMap(session),
    ]);

    const records: Prisma.AiPayrollSourceRecordCreateManyInput[] = [];
    for (const item of items as any[]) {
      const orderDate = this.parseDateValue(item.order_date ?? item.wa_order_date);
      if (!orderDate) continue;
      const date = this.toDateOnly(orderDate);
      if (date < session.dateFrom || date > session.dateTo) continue;

      const employeeId = this.resolveEmployeeIdForSource(
        item.wa_item_driver_id,
        item.wa_item_driver_nickname,
        employeeMatcher,
        workLogVehicleEmployeeMap,
        date,
        item.wa_item_vehicle_no ?? item.wa_item_machine_code,
      );
      if (!employeeId || !session.employeeIds.includes(employeeId)) continue;
      const employeeName = employeeMatcher.nameById.get(employeeId) ?? item.wa_item_driver_nickname ?? null;
      const data: StandardizedSourceRecordData = {
        employee_id: employeeId,
        employee_name: employeeName,
        date: this.toDateString(date),
        service_type: item.wa_item_service_type ?? null,
        start_location: item.wa_item_location ?? null,
        machine_type: item.wa_item_machine_type ?? null,
        equipment_number: item.wa_item_vehicle_no ?? item.wa_item_machine_code ?? null,
        contract_no: item.wa_item_contract_no ?? null,
        client_name: item.wa_item_customer ?? null,
        work_content: item.wa_item_work_desc ?? item.wa_item_remarks ?? null,
        quantity: this.decimalLikeToNumber(item.wa_item_goods_quantity),
        unit: item.wa_item_product_unit ?? null,
        source_label: 'WhatsApp Order',
        source_status: 'found',
        match_basis: item.wa_item_driver_id ? 'driver_id + date' : 'driver nickname / vehicle + date',
        raw_summary: [
          item.wa_item_customer,
          item.wa_item_contract_no,
          item.wa_item_location,
          item.wa_item_work_desc,
        ].filter(Boolean).join(' / ') || null,
      };
      records.push({
        source_record_session_id: session.id,
        source_record_employee_id: employeeId,
        source_record_date: date,
        source_record_source_type: 'whatsapp_order',
        source_record_source_id: item.id,
        source_record_data: data as unknown as Prisma.InputJsonValue,
        source_record_raw_data: this.toJson({
          id: item.id,
          order_date: this.toDateString(date),
          order_status: item.order_status,
          order_version: item.order_version,
          driver_id: item.wa_item_driver_id,
          driver_nickname: item.wa_item_driver_nickname,
          vehicle: item.wa_item_vehicle_no,
          machine_code: item.wa_item_machine_code,
          customer: item.wa_item_customer,
          contract_no: item.wa_item_contract_no,
          location: item.wa_item_location,
          work_desc: item.wa_item_work_desc,
          product_name: item.wa_item_product_name,
          product_unit: item.wa_item_product_unit,
          goods_quantity: this.decimalLikeToNumber(item.wa_item_goods_quantity),
          remarks: item.wa_item_remarks,
        }),
        source_record_confidence: undefined,
      });
    }
    return records;
  }

  private async collectReceiptSources(
    session: SessionContext,
  ): Promise<Prisma.AiPayrollSourceRecordCreateManyInput[]> {
    const sources = await this.prisma.verificationSource.findMany({
      where: { source_code: { in: ['receipt', 'slip_chit', 'slip_no_chit'] } },
      select: { id: true, source_code: true, source_name: true },
    });
    const sourceIds = sources.map((source) => source.id);
    if (sourceIds.length === 0) return [];
    const sourceById = new Map(sources.map((source) => [source.id, source]));
    const [records, employeeMatcher, workLogVehicleEmployeeMap] = await Promise.all([
      this.prisma.verificationRecord.findMany({
        where: {
          record_source_id: { in: sourceIds },
          record_work_date: { gte: session.dateFrom, lte: session.dateTo },
        },
        include: { chits: true },
        orderBy: [{ record_work_date: 'asc' }, { id: 'asc' }],
      }),
      this.buildEmployeeMatcher(session.employeeIds),
      this.buildWorkLogVehicleEmployeeMap(session),
    ]);

    return records.flatMap((record) => {
      if (!record.record_work_date) return [];
      const date = this.toDateOnly(record.record_work_date);
      const employeeId = this.resolveEmployeeIdForSource(
        record.record_employee_id,
        record.record_employee_name ?? record.record_driver_name,
        employeeMatcher,
        workLogVehicleEmployeeMap,
        date,
        record.record_vehicle_no,
      );
      if (!employeeId || !session.employeeIds.includes(employeeId)) return [];
      const source = sourceById.get(record.record_source_id);
      const raw = (record.record_raw_data ?? {}) as Record<string, unknown>;
      const chitNos = record.chits?.map((chit) => chit.chit_no).filter(Boolean) ?? [];
      const flattenedChitNos = chitNos.flatMap((chitNo) =>
        String(chitNo).split(',').map((value) => value.trim()).filter(Boolean),
      );
      const data: StandardizedSourceRecordData = {
        employee_id: employeeId,
        employee_name: employeeMatcher.nameById.get(employeeId) ?? record.record_employee_name ?? record.record_driver_name ?? null,
        date: this.toDateString(date),
        start_time: this.timeToString(record.record_time_in),
        end_time: this.timeToString(record.record_time_out),
        start_location: record.record_location_from ?? null,
        end_location: record.record_location_to ?? null,
        equipment_number: record.record_vehicle_no ?? null,
        contract_no: record.record_contract_no ?? null,
        client_name: record.record_customer ?? null,
        quantity: this.parseNumber(record.record_quantity),
        unit: this.stringOrNull(raw.unit),
        work_content: this.stringOrNull(raw.work_desc ?? raw.work_content ?? raw.description),
        source_label: '入帳票',
        source_status: 'found',
        match_basis: record.record_employee_id ? 'record_employee_id + date' : 'driver name / vehicle + date',
        raw_summary: [
          record.record_vehicle_no,
          record.record_customer,
          record.record_contract_no,
          flattenedChitNos.join(', '),
        ].filter(Boolean).join(' / ') || null,
      };
      return [{
        source_record_session_id: session.id,
        source_record_employee_id: employeeId,
        source_record_date: date,
        source_record_source_type: 'receipt',
        source_record_source_id: record.id,
        source_record_data: data as unknown as Prisma.InputJsonValue,
        source_record_raw_data: this.toJson({
          id: record.id,
          source_code: source?.source_code,
          source_name: source?.source_name,
          date: this.toDateString(date),
          vehicle: record.record_vehicle_no,
          driver_name: record.record_driver_name,
          employee_id: record.record_employee_id,
          employee_name: record.record_employee_name,
          customer: record.record_customer,
          location_from: record.record_location_from,
          location_to: record.record_location_to,
          time_in: this.timeToString(record.record_time_in),
          time_out: this.timeToString(record.record_time_out),
          contract_no: record.record_contract_no,
          slip_no: record.record_slip_no,
          chit_nos: flattenedChitNos.length > 0 ? flattenedChitNos : chitNos,
          quantity: record.record_quantity,
          weight_net: this.decimalLikeToNumber(record.record_weight_net),
          raw_data: raw,
        }),
        source_record_confidence: record.record_ocr_confidence ?? undefined,
      }];
    });
  }

  private async collectGpsSources(
    session: SessionContext,
  ): Promise<Prisma.AiPayrollSourceRecordCreateManyInput[]> {
    const [gpsSummaries, workLogVehicleEmployeeMap] = await Promise.all([
      this.prisma.verificationGpsSummary.findMany({
        where: { gps_summary_date: { gte: session.dateFrom, lte: session.dateTo } },
        orderBy: [{ gps_summary_date: 'asc' }, { id: 'asc' }],
      }),
      this.buildWorkLogVehicleEmployeeMap(session),
    ]);

    const records: Prisma.AiPayrollSourceRecordCreateManyInput[] = [];
    const seen = new Set<string>();
    for (const gps of gpsSummaries) {
      if (!gps.gps_summary_date) continue;
      const date = this.toDateOnly(gps.gps_summary_date);
      const employeeIds = this.findEmployeeIdsByVehicleDate(
        workLogVehicleEmployeeMap,
        date,
        gps.gps_summary_vehicle_no,
      );
      for (const employeeId of employeeIds) {
        if (!session.employeeIds.includes(employeeId)) continue;
        const dedupeKey = `${gps.id}:${employeeId}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        const data: StandardizedSourceRecordData = {
          employee_id: employeeId,
          employee_name: null,
          date: this.toDateString(date),
          equipment_number: gps.gps_summary_vehicle_no ?? null,
          start_time: gps.gps_summary_start_time?.toISOString() ?? null,
          end_time: gps.gps_summary_end_time?.toISOString() ?? null,
          start_location: this.gpsLocationsToString(gps.gps_summary_locations),
          quantity: this.decimalLikeToNumber(gps.gps_summary_total_distance),
          unit: 'km',
          source_label: 'GPS 追蹤',
          source_status: 'found',
          match_basis: 'work_log vehicle + date',
          raw_summary: `${gps.gps_summary_vehicle_no ?? '—'} / ${this.gpsLocationsToString(gps.gps_summary_locations) ?? '—'}`,
        };
        records.push({
          source_record_session_id: session.id,
          source_record_employee_id: employeeId,
          source_record_date: date,
          source_record_source_type: 'gps',
          source_record_source_id: gps.id,
          source_record_data: data as unknown as Prisma.InputJsonValue,
          source_record_raw_data: this.toJson({
            id: gps.id,
            vehicle: gps.gps_summary_vehicle_no,
            date: this.toDateString(date),
            start_time: gps.gps_summary_start_time?.toISOString() ?? null,
            end_time: gps.gps_summary_end_time?.toISOString() ?? null,
            total_distance: this.decimalLikeToNumber(gps.gps_summary_total_distance),
            trip_count: gps.gps_summary_trip_count,
            locations: gps.gps_summary_locations,
            raw_points: gps.gps_summary_raw_points,
            ai_model: gps.gps_summary_ai_model,
          }),
          source_record_confidence: undefined,
        });
      }
    }
    return records;
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
    const sourceTypes = [...new Set(group.map((source) => this.normalizeSourceType(source.source_record_source_type)))];
    const baseSourceType = group
      .map((source) => this.normalizeSourceType(source.source_record_source_type))
      .sort((left, right) => this.sourceWeight(right) - this.sourceWeight(left))[0] ?? null;
    return {
      source_count: group.length,
      source_types: sourceTypes,
      agreed_fields: agreed,
      conflicted_fields: conflicted,
      missing_fields: missing,
      base_source_type: baseSourceType,
      ai_summary: this.buildAiSummary(group, conflicted),
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

  private buildAiSummary(group: SourceRecordRow[], conflictedFields: string[]): string {
    if (conflictedFields.length === 0) return '各來源一致';
    const baseSource = [...group].sort(
      (left, right) => this.sourceWeight(right.source_record_source_type) - this.sourceWeight(left.source_record_source_type),
    )[0];
    const baseData = this.asSourceData(baseSource?.source_record_data);
    const baseLabel = this.sourceTypeLabel(baseSource?.source_record_source_type);
    const fieldLabels: Record<string, string> = {
      service_type: '服務類型',
      day_night: '日/夜',
      start_location: '起點',
      end_location: '終點',
      machine_type: '機種',
      equipment_number: '機號',
      quantity: '數量/時數',
      unit: '單位',
      ot_quantity: 'OT',
      work_content: '工作內容',
    };
    const summaries = conflictedFields.slice(0, 3).map((field) => {
      const baseValue = this.summaryValue(baseData[field as keyof StandardizedSourceRecordData]);
      const otherValues = group
        .filter((source) => source.id !== baseSource?.id)
        .map((source) => {
          const value = this.summaryValue(this.asSourceData(source.source_record_data)[field as keyof StandardizedSourceRecordData]);
          return value ? `${this.sourceTypeLabel(source.source_record_source_type)} ${value}` : null;
        })
        .filter((value): value is string => Boolean(value));
      const label = fieldLabels[field] ?? field;
      return `${label}有差異：${baseLabel} ${baseValue || '—'}${otherValues.length > 0 ? ` vs ${otherValues.join(' / ')}` : ''}`;
    });
    return summaries.join('；');
  }

  private summaryValue(value: unknown): string | null {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value === 'object') return null;
    const text = String(value).trim();
    if (!text) return null;
    return text.length > 40 ? `${text.slice(0, 40)}…` : text;
  }

  private sourceTypeLabel(sourceType?: string | null): string {
    const normalized = this.normalizeSourceType(sourceType ?? 'system');
    const labels: Record<string, string> = {
      work_log: '工作紀錄',
      homework_sheet: '功課紙',
      clock: '打卡',
      whatsapp_order: 'Order',
      receipt: '入帳票',
      gps: 'GPS',
      manual: '手動輸入',
      system: '系統',
    };
    return labels[normalized] ?? normalized;
  }

  private getFieldWinner(
    group: SourceRecordRow[],
    field: keyof StandardizedSourceRecordData,
  ): string | number | boolean | null | undefined {
    const sortedSources = [...group].sort(
      (left, right) => this.sourceWeight(right.source_record_source_type) - this.sourceWeight(left.source_record_source_type),
    );
    for (const source of sortedSources) {
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
      if (`${rawValue}`.trim() === '') continue;
      return rawValue;
    }
    return undefined;
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
    if (source === 'attendance') return 'clock';
    if (source === 'whatsapp_clockin' || source === 'employee_portal') return 'whatsapp_order';
    return 'work_log';
  }

  private normalizeSourceType(sourceType: string): AiPayrollSourceType {
    if (sourceType === 'attendance') return 'clock';
    if (sourceType === 'ocr') return 'homework_sheet';
    if (sourceType === 'chit' || sourceType === 'delivery_note' || sourceType === 'slip_chit' || sourceType === 'slip_no_chit') return 'receipt';
    if (sourceType === 'whatsapp_clockin' || sourceType === 'employee_portal') return 'whatsapp_order';
    if (
      sourceType === 'work_log' ||
      sourceType === 'homework_sheet' ||
      sourceType === 'clock' ||
      sourceType === 'whatsapp_order' ||
      sourceType === 'receipt' ||
      sourceType === 'gps' ||
      sourceType === 'manual' ||
      sourceType === 'system'
    ) {
      return sourceType;
    }
    return 'system';
  }

  private sourceWeight(sourceType: string): number {
    const normalized = this.normalizeSourceType(sourceType);
    if (normalized === 'work_log') return 50;
    if (normalized === 'homework_sheet') return 40;
    if (normalized === 'clock') return 30;
    if (normalized === 'whatsapp_order') return 20;
    if (normalized === 'receipt') return 10;
    if (normalized === 'gps') return 5;
    return 1;
  }


  private async buildEmployeeMatcher(employeeIds: number[]): Promise<{
    nameById: Map<number, string>;
    idByName: Map<string, number>;
  }> {
    const [employees, nicknames] = await Promise.all([
      this.prisma.employee.findMany({
        where: { id: { in: employeeIds } },
        select: { id: true, name_zh: true, name_en: true, nickname: true, emp_code: true },
      }),
      this.prisma.employeeNickname.findMany({
        where: { emp_nickname_employee_id: { in: employeeIds } },
        select: { emp_nickname_employee_id: true, emp_nickname_value: true },
      }),
    ]);
    const nameById = new Map<number, string>();
    const idByName = new Map<string, number>();
    const addName = (employeeId: number, value: string | null | undefined) => {
      const normalized = this.normalizeText(value);
      if (normalized) idByName.set(normalized, employeeId);
    };
    for (const employee of employees) {
      nameById.set(employee.id, employee.name_zh ?? employee.name_en ?? employee.nickname ?? employee.emp_code ?? `#${employee.id}`);
      addName(employee.id, employee.name_zh);
      addName(employee.id, employee.name_en);
      addName(employee.id, employee.nickname);
      addName(employee.id, employee.emp_code);
    }
    for (const nickname of nicknames) {
      addName(nickname.emp_nickname_employee_id, nickname.emp_nickname_value);
    }
    return { nameById, idByName };
  }

  private async buildWorkLogVehicleEmployeeMap(session: SessionContext): Promise<Map<string, Set<number>>> {
    const workLogs = await this.prisma.workLog.findMany({
      where: {
        employee_id: { in: session.employeeIds },
        scheduled_date: { gte: session.dateFrom, lte: session.dateTo },
        deleted_at: null,
        equipment_number: { not: null },
      },
      select: { employee_id: true, scheduled_date: true, equipment_number: true },
    });
    const map = new Map<string, Set<number>>();
    for (const workLog of workLogs) {
      if (!workLog.employee_id || !workLog.scheduled_date || !workLog.equipment_number) continue;
      const key = this.vehicleDateKey(workLog.scheduled_date, workLog.equipment_number);
      const existing = map.get(key) ?? new Set<number>();
      existing.add(workLog.employee_id);
      map.set(key, existing);
    }
    return map;
  }

  private resolveEmployeeIdForSource(
    explicitEmployeeId: number | null | undefined,
    name: string | null | undefined,
    employeeMatcher: { idByName: Map<string, number> },
    workLogVehicleEmployeeMap: Map<string, Set<number>>,
    date: Date,
    vehicle: string | null | undefined,
  ): number | null {
    if (explicitEmployeeId) return explicitEmployeeId;
    const normalizedName = this.normalizeText(name);
    if (normalizedName && employeeMatcher.idByName.has(normalizedName)) {
      return employeeMatcher.idByName.get(normalizedName) ?? null;
    }
    const employeeIds = this.findEmployeeIdsByVehicleDate(workLogVehicleEmployeeMap, date, vehicle);
    return employeeIds.length === 1 ? employeeIds[0] : null;
  }

  private findEmployeeIdsByVehicleDate(
    map: Map<string, Set<number>>,
    date: Date,
    vehicle: string | null | undefined,
  ): number[] {
    const normalizedVehicle = this.normalizeVehicle(vehicle);
    if (!normalizedVehicle) return [];
    const direct = map.get(this.vehicleDateKey(date, normalizedVehicle));
    if (direct) return [...direct];
    const dateString = this.toDateString(date);
    const matched = new Set<number>();
    for (const [key, employeeIds] of map.entries()) {
      const [keyDate, keyVehicle] = key.split('|');
      if (keyDate !== dateString) continue;
      if (this.fuzzyPlateMatch(keyVehicle, normalizedVehicle)) {
        for (const employeeId of employeeIds) matched.add(employeeId);
      }
    }
    return [...matched];
  }

  private vehicleDateKey(date: Date, vehicle: string | null | undefined): string {
    return `${this.toDateString(date)}|${this.normalizeVehicle(vehicle)}`;
  }

  private normalizeVehicle(value: string | null | undefined): string {
    return (value ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  }

  private fuzzyPlateMatch(left: string | null | undefined, right: string | null | undefined): boolean {
    const a = this.normalizeVehicle(left);
    const b = this.normalizeVehicle(right);
    if (!a || !b) return false;
    if (a === b) return true;
    return a.includes(b) || b.includes(a);
  }

  private normalizeText(value: string | null | undefined): string {
    return (value ?? '').toString().trim().toLowerCase().replace(/\s+/g, '');
  }

  private nextDay(date: Date): Date {
    return new Date(this.toDateOnly(date).getTime() + 86400000);
  }

  private toDateOnly(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }

  private parseDateValue(value: unknown): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;
    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private decimalLikeToNumber(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  private timeToString(value: Date | null): string | null {
    if (!value) return null;
    return value.toISOString();
  }

  private gpsLocationsToString(value: unknown): string | null {
    if (!value) return null;
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) {
      return value.map((entry) => {
        if (typeof entry === 'string') return entry;
        if (entry && typeof entry === 'object') {
          const record = entry as Record<string, unknown>;
          return String(record.location ?? record.address ?? record.name ?? JSON.stringify(record));
        }
        return String(entry);
      }).filter(Boolean).join(' → ');
    }
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
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
