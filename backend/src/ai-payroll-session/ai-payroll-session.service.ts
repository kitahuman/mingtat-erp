import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AiPayrollService } from '../ai-payroll/ai-payroll.service';
import { StartExtractionJobDto } from '../ai-payroll/dto/start-extraction-job.dto';
import { UploadPayrollDocumentDto } from '../ai-payroll/dto/upload-payroll-document.dto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { GeneratePayrollDto, RetrySessionDto, StartSessionDto } from './dto/generate-payroll.dto';
import { QuerySessionsDto } from './dto/query-sessions.dto';
import { AiPayrollReconcileService } from './ai-payroll-reconcile.service';
import { AiPayrollGenerateService } from './ai-payroll-generate.service';

const PROCESSING_STATUSES = ['collecting', 'recognizing', 'reconciling', 'calculating', 'generating'];
const RESTARTABLE_STATUSES = ['pending', 'failed', 'needs_review', 'completed'];

@Injectable()
export class AiPayrollSessionService {
  private readonly logger = new Logger(AiPayrollSessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiPayrollService: AiPayrollService,
    private readonly reconcileService: AiPayrollReconcileService,
    private readonly generateService: AiPayrollGenerateService,
  ) {}

  async createSession(dto: CreateSessionDto, userId: number) {
    const company = await this.prisma.company.findUnique({
      where: { id: dto.company_id },
    });
    if (!company) throw new NotFoundException('公司不存在');
    if (new Date(dto.date_from) > new Date(dto.date_to)) {
      throw new BadRequestException('開始日期不可晚於結束日期');
    }

    const session = await this.prisma.aiPayrollSession.create({
      data: {
        session_company_id: dto.company_id,
        session_period: dto.period,
        session_date_from: new Date(dto.date_from),
        session_date_to: new Date(dto.date_to),
        session_employee_ids: dto.employee_ids as Prisma.InputJsonValue,
        session_created_by: userId,
      },
    });

    await this.prisma.aiPayrollBatch.create({
      data: {
        batch_payroll_month: dto.period,
        batch_period: 'auto',
        batch_form_type_default: 'auto',
        batch_status: 'draft',
        batch_notes: `AI 計糧會話 #${session.id}`,
        batch_created_by: userId,
        batch_session_id: session.id,
      },
    });

    return this.getSession(session.id);
  }

  async listSessions(query: QuerySessionsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.AiPayrollSessionWhereInput = {
      ...(query.status ? { session_status: query.status } : {}),
      ...(query.period ? { session_period: query.period } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.aiPayrollSession.findMany({
        where,
        include: {
          company: true,
          batches: { include: { documents: true } },
          _count: {
            select: {
              questions: true,
              source_records: true,
              reconcile_items: true,
              payrolls: true,
            },
          },
        },
        orderBy: { session_created_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.aiPayrollSession.count({ where }),
    ]);
    return { data, total, page, pageSize };
  }

  async getSession(sessionId: number) {
    const session = await this.prisma.aiPayrollSession.findUnique({
      where: { id: sessionId },
      include: {
        company: true,
        batches: { include: { documents: { include: { pages: true } } } },
        questions: { orderBy: { question_created_at: 'desc' } },
        _count: {
          select: {
            questions: true,
            source_records: true,
            reconcile_items: true,
            payrolls: true,
          },
        },
      },
    });
    if (!session) throw new NotFoundException('AI 計糧會話不存在');
    return session;
  }

  async deleteSession(sessionId: number) {
    await this.ensureSession(sessionId);
    await this.prisma.aiPayrollSession.update({
      where: { id: sessionId },
      data: { session_status: 'cancelled' },
    });
    return { success: true };
  }

  async uploadDocument(
    sessionId: number,
    file: Express.Multer.File,
    dto: UploadPayrollDocumentDto,
    userId: number,
  ) {
    const batch = await this.ensureSessionBatch(sessionId, userId);
    const document = await this.aiPayrollService.uploadDocument(batch.id, file, dto, userId);
    await this.refreshDocumentIds(sessionId);
    return document;
  }

  async listDocuments(sessionId: number) {
    await this.ensureSession(sessionId);
    return this.prisma.aiPayrollDocument.findMany({
      where: { batch: { batch_session_id: sessionId } },
      include: { pages: { orderBy: { page_number: 'asc' } }, batch: true },
      orderBy: { doc_created_at: 'desc' },
    });
  }

  async deleteDocument(sessionId: number, docId: number) {
    const document = await this.prisma.aiPayrollDocument.findFirst({
      where: { id: docId, batch: { batch_session_id: sessionId } },
    });
    if (!document) throw new NotFoundException('文件不存在');
    await this.prisma.aiPayrollDocument.delete({ where: { id: docId } });
    await this.refreshDocumentIds(sessionId);
    return { success: true };
  }

  async start(sessionId: number, dto: StartSessionDto) {
    const session = await this.ensureSession(sessionId);
    const isProcessing = PROCESSING_STATUSES.includes(session.session_status);
    if (!dto.force_restart && !RESTARTABLE_STATUSES.includes(session.session_status)) {
      throw new BadRequestException(
        isProcessing
          ? 'AI 計糧流程仍在處理中，如需重新開始請使用 force_restart'
          : '目前狀態不可重新開始，請使用 force_restart',
      );
    }

    await this.updateProgress(sessionId, 'collecting', 1, null);

    setImmediate(() => {
      void this.runStartWorkflow(
        sessionId,
        dto.force_restart ?? false,
        session.session_created_by ?? 0,
      ).catch((error) => {
        this.logger.error(
          `AI payroll session ${sessionId} background task crashed: ${this.getErrorMessage(error)}`,
          error instanceof Error ? error.stack : undefined,
        );
      });
    });

    return { status: 'processing' };
  }

  private async runStartWorkflow(sessionId: number, forceRestart: boolean, userId: number) {
    try {
      await this.reconcileService.collectSources(sessionId);

      await this.updateProgress(sessionId, 'recognizing', 2, null);
      const batch = await this.ensureSessionBatch(sessionId, userId);
      const documents = await this.listDocuments(sessionId);
      if (documents.length > 0) {
        await this.aiPayrollService.startExtractionJob(batch.id, {
          forceReExtract: forceRestart,
        } as StartExtractionJobDto);
      }

      await this.updateProgress(sessionId, 'reconciling', 3, null);
      await this.reconcileService.collectSources(sessionId);
      const reconcileResult = await this.reconcileService.reconcile(sessionId);

      await this.updateProgress(
        sessionId,
        reconcileResult.needsReview ? 'needs_review' : 'completed',
        5,
        null,
      );
    } catch (error) {
      const message = this.getErrorMessage(error);
      this.logger.error(
        `AI payroll session ${sessionId} start workflow failed: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      await this.markFailed(sessionId, message);
    }
  }

  async getProgress(sessionId: number) {
    const session = await this.getSession(sessionId);
    const [
      sourceCount,
      reconcileCount,
      unresolvedQuestions,
      documentCount,
      payrollCount,
      homeworkSheetSourceCount,
      extractionEntryCount,
      failedPageCount,
      extractedPageCount,
      totalPageCount,
    ] = await Promise.all([
      this.prisma.aiPayrollSourceRecord.count({
        where: { source_record_session_id: sessionId },
      }),
      this.prisma.aiPayrollReconcileItem.count({
        where: { reconcile_session_id: sessionId },
      }),
      this.prisma.aiPayrollQuestion.count({
        where: { question_session_id: sessionId, question_resolved: false },
      }),
      this.prisma.aiPayrollDocument.count({
        where: { batch: { batch_session_id: sessionId } },
      }),
      this.prisma.payroll.count({
        where: { payroll_ai_session_id: sessionId },
      }),
      this.prisma.aiPayrollSourceRecord.count({
        where: {
          source_record_session_id: sessionId,
          source_record_source_type: 'homework_sheet',
        },
      }),
      this.prisma.aiPayrollEntry.count({
        where: { page: { document: { batch: { batch_session_id: sessionId } } } },
      }),
      this.prisma.aiPayrollPage.count({
        where: { document: { batch: { batch_session_id: sessionId } }, page_status: 'failed' },
      }),
      this.prisma.aiPayrollPage.count({
        where: { document: { batch: { batch_session_id: sessionId } }, page_status: 'extracted' },
      }),
      this.prisma.aiPayrollPage.count({
        where: { document: { batch: { batch_session_id: sessionId } } },
      }),
    ]);
    const warnings = this.buildDocumentWarnings({
      documentCount,
      homeworkSheetSourceCount,
      extractionEntryCount,
      failedPageCount,
      extractedPageCount,
      status: session.session_status,
    });
    return {
      sessionId,
      status: session.session_status,
      currentStep: session.session_current_step,
      errorMessage: session.session_error_message,
      warnings,
      documentOcr: {
        documents: documentCount,
        pages: totalPageCount,
        extractedPages: extractedPageCount,
        failedPages: failedPageCount,
        extractedEntries: extractionEntryCount,
        homeworkSheetSourceRecords: homeworkSheetSourceCount,
        hasWarning: warnings.length > 0,
      },
      counts: {
        documents: documentCount,
        sources: sourceCount,
        homeworkSheetSources: homeworkSheetSourceCount,
        reconcileItems: reconcileCount,
        unresolvedQuestions,
        payrolls: payrollCount,
      },
      progressPercent: this.calculateProgress(session.session_current_step, session.session_status),
    };
  }

  async retry(sessionId: number, dto: RetrySessionDto) {
    await this.ensureSession(sessionId);
    if (dto.step === 1 || dto.step === undefined) {
      await this.updateProgress(sessionId, 'collecting', 1, null);
      return this.start(sessionId, { force_restart: true });
    }
    if (dto.step === 2) {
      await this.updateProgress(sessionId, 'recognizing', 2, null);
      const batch = await this.ensureSessionBatch(sessionId, 0);
      return this.aiPayrollService.startExtractionJob(batch.id, { forceReExtract: true } as StartExtractionJobDto);
    }
    if (dto.step === 3) {
      await this.updateProgress(sessionId, 'reconciling', 3, null);
      await this.reconcileService.collectSources(sessionId);
      return this.reconcileService.reconcile(sessionId);
    }
    if (dto.step === 4) {
      await this.updateProgress(sessionId, 'calculating', 4, null);
      return this.generateService.preview(sessionId, {});
    }
    throw new BadRequestException('不支援的重試步驟');
  }

  async generate(sessionId: number, dto: GeneratePayrollDto, userId: number) {
    return this.generateService.generate(sessionId, dto, userId);
  }

  private async ensureSession(sessionId: number) {
    const session = await this.prisma.aiPayrollSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException('AI 計糧會話不存在');
    return session;
  }

  private async ensureSessionBatch(sessionId: number, userId: number) {
    const session = await this.ensureSession(sessionId);
    const existing = await this.prisma.aiPayrollBatch.findFirst({
      where: { batch_session_id: sessionId },
      orderBy: { id: 'asc' },
    });
    if (existing) return existing;
    return this.prisma.aiPayrollBatch.create({
      data: {
        batch_payroll_month: session.session_period,
        batch_period: 'auto',
        batch_form_type_default: 'auto',
        batch_status: 'draft',
        batch_notes: `AI 計糧會話 #${sessionId}`,
        batch_created_by: userId,
        batch_session_id: sessionId,
      },
    });
  }

  private async refreshDocumentIds(sessionId: number) {
    const documents = await this.prisma.aiPayrollDocument.findMany({
      where: { batch: { batch_session_id: sessionId } },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    await this.prisma.aiPayrollSession.update({
      where: { id: sessionId },
      data: {
        session_document_ids: documents.map((document) => document.id) as Prisma.InputJsonValue,
      },
    });
  }

  private async updateProgress(
    sessionId: number,
    status: string,
    step: number,
    errorMessage: string | null,
  ) {
    await this.prisma.aiPayrollSession.update({
      where: { id: sessionId },
      data: {
        session_status: status,
        session_current_step: step,
        session_error_message: errorMessage,
      },
    });
  }

  private async markFailed(sessionId: number, errorMessage: string) {
    await this.prisma.aiPayrollSession.update({
      where: { id: sessionId },
      data: {
        session_status: 'failed',
        session_error_message: errorMessage,
      },
    });
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) return error.message;
    if (typeof error === 'string' && error.trim()) return error;
    return 'AI 計糧流程執行失敗，請重試';
  }

  private buildDocumentWarnings(args: {
    documentCount: number;
    homeworkSheetSourceCount: number;
    extractionEntryCount: number;
    failedPageCount: number;
    extractedPageCount: number;
    status: string;
  }) {
    const warnings: Array<{ code: string; message: string; severity: 'warning' }> = [];
    if (args.documentCount === 0) return warnings;
    if (args.failedPageCount > 0) {
      warnings.push({
        code: 'document_ocr_failed',
        message: '部分文件未能讀取',
        severity: 'warning',
      });
    }
    const recognitionHasRun =
      args.failedPageCount > 0 ||
      args.extractedPageCount > 0 ||
      ['reconciling', 'needs_review', 'completed', 'confirmed', 'failed'].includes(args.status);
    if (recognitionHasRun && args.homeworkSheetSourceCount === 0 && args.extractionEntryCount === 0) {
      warnings.push({
        code: 'document_ocr_no_records',
        message: 'AI 未能從上載文件中讀取資料，核對將使用其他來源（工作紀錄、打卡等）',
        severity: 'warning',
      });
    }
    return warnings;
  }

  private calculateProgress(step: number, status: string): number {
    if (status === 'confirmed') return 100;
    if (status === 'completed' || status === 'needs_review') return 90;
    return Math.min(Math.max(step, 1), 5) * 18;
  }
}
