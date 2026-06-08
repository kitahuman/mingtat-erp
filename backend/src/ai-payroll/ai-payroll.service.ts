import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { existsSync, mkdirSync, copyFileSync } from 'fs';
import { basename, extname, join, relative } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { AiKnowledgeCandidateService } from '../ai-knowledge/ai-knowledge-candidate.service';
import { CreateAiPayrollBatchDto } from './dto/create-ai-payroll-batch.dto';
import { QueryPayrollBatchesDto } from './dto/query-payroll-batches.dto';
import { QueryPayrollEntriesDto } from './dto/query-payroll-entries.dto';
import { StartExtractionJobDto } from './dto/start-extraction-job.dto';
import { UpdateEntryFieldDto } from './dto/update-entry-field.dto';
import { MatchEmployeeDto } from './dto/match-employee.dto';
import { ExcludeEntryDto } from './dto/exclude-entry.dto';
import { UploadPayrollDocumentDto } from './dto/upload-payroll-document.dto';
import { AiPayrollExtractionService } from './ai-payroll-extraction.service';

const UPLOAD_ROOT = join(process.cwd(), 'uploads', 'ai-payroll');
const DOCUMENT_DIR = join(UPLOAD_ROOT, 'documents');
const PAGE_DIR = join(UPLOAD_ROOT, 'pages');

type JsonRecord = Record<string, unknown>;

@Injectable()
export class AiPayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly extractionService: AiPayrollExtractionService,
    private readonly candidateService: AiKnowledgeCandidateService,
  ) {}

  async createBatch(dto: CreateAiPayrollBatchDto, userId: number) {
    const batchPayrollMonth = dto.payroll_month.trim();
    const notes = [
      dto.notes,
      dto.expected_pay_date ? `預計出糧日：${dto.expected_pay_date}` : undefined,
      dto.department ? `部門：${dto.department}` : undefined,
      dto.site_name ? `地盤：${dto.site_name}` : undefined,
    ]
      .filter((item): item is string => Boolean(item))
      .join('\n');

    return this.prisma.aiPayrollBatch.create({
      data: {
        batch_payroll_month: batchPayrollMonth,
        batch_period: dto.payroll_period ?? 'auto',
        batch_form_type_default: dto.default_form_type ?? 'auto',
        batch_notes: notes || undefined,
        batch_created_by: userId,
      },
    });
  }

  async listBatches(query: QueryPayrollBatchesDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.AiPayrollBatchWhereInput = {
      ...(query.payrollMonth ? { batch_payroll_month: query.payrollMonth } : {}),
      ...(query.status ? { batch_status: query.status } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.aiPayrollBatch.findMany({
        where,
        orderBy: { batch_created_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { _count: { select: { documents: true } } },
      }),
      this.prisma.aiPayrollBatch.count({ where }),
    ]);
    return { data, total, page, pageSize };
  }

  async getBatch(batchId: number) {
    const batch = await this.prisma.aiPayrollBatch.findUnique({
      where: { id: batchId },
      include: {
        documents: {
          include: { pages: { include: { entries: { include: { fields: true } } }, orderBy: { page_number: 'asc' } } },
          orderBy: { doc_created_at: 'desc' },
        },
      },
    });
    if (!batch) throw new NotFoundException('批次不存在');
    return batch;
  }

  async uploadDocument(batchId: number, file: Express.Multer.File, dto: UploadPayrollDocumentDto, userId: number) {
    const batch = await this.prisma.aiPayrollBatch.findUnique({ where: { id: batchId } });
    if (!batch) throw new NotFoundException('批次不存在');
    if (!file) throw new BadRequestException('請選擇文件');

    mkdirSync(DOCUMENT_DIR, { recursive: true });
    mkdirSync(PAGE_DIR, { recursive: true });
    const storedPath = this.toRelativePath(file.path);
    const document = await this.prisma.aiPayrollDocument.create({
      data: {
        doc_batch_id: batchId,
        doc_original_filename: Buffer.from(file.originalname, 'latin1').toString('utf8'),
        doc_storage_path: storedPath,
        doc_mime_type: file.mimetype,
        doc_file_size: file.size,
        doc_quality_score: 80,
        doc_quality_issues: [] as Prisma.InputJsonValue,
        doc_uploaded_by: userId,
      },
    });

    const pagePaths = await this.createPagesForDocument(file, document.id, dto.formTypeHint ?? batch.batch_form_type_default);
    await this.prisma.aiPayrollDocument.update({
      where: { id: document.id },
      data: { doc_page_count: pagePaths.length, doc_status: 'ready' },
    });
    await this.prisma.aiPayrollBatch.update({ where: { id: batchId }, data: { batch_status: 'uploaded' } });
    return this.prisma.aiPayrollDocument.findUnique({ where: { id: document.id }, include: { pages: true } });
  }

  async listDocuments(batchId: number) {
    await this.ensureBatch(batchId);
    return this.prisma.aiPayrollDocument.findMany({
      where: { doc_batch_id: batchId },
      include: { pages: { orderBy: { page_number: 'asc' } } },
      orderBy: { doc_created_at: 'desc' },
    });
  }

  async startExtractionJob(batchId: number, dto: StartExtractionJobDto) {
    await this.ensureBatch(batchId);
    await this.prisma.aiPayrollBatch.update({ where: { id: batchId }, data: { batch_status: 'processing' } });
    const pages = await this.prisma.aiPayrollPage.findMany({
      where: {
        document: { doc_batch_id: batchId },
        ...(dto.pageIds?.length ? { id: { in: dto.pageIds } } : {}),
      },
      orderBy: [{ page_document_id: 'asc' }, { page_number: 'asc' }],
    });
    const results: Awaited<ReturnType<AiPayrollExtractionService['extractPage']>>[] = [];
    for (const page of pages) {
      results.push(await this.extractionService.extractPage(page.id, dto.formTypeOverride, dto.forceReExtract ?? false));
    }
    const failed = await this.prisma.aiPayrollPage.count({ where: { document: { doc_batch_id: batchId }, page_status: 'failed' } });
    await this.prisma.aiPayrollBatch.update({ where: { id: batchId }, data: { batch_status: failed > 0 ? 'partially_failed' : 'extracted' } });
    return { jobId: `job_${batchId}`, batchId, status: failed > 0 ? 'partially_failed' : 'completed', estimatedPages: pages.length, results };
  }

  async getExtractionJob(jobId: string) {
    const batchId = this.parseJobBatchId(jobId);
    const stats = await this.getBatchStats(batchId);
    return { jobId, batchId, status: stats.batchStatus, stats };
  }

  async reExtractPage(pageId: number, dto: StartExtractionJobDto) {
    const result = await this.extractionService.extractPage(pageId, dto.formTypeOverride, true);
    return result;
  }

  async listEntries(batchId: number, query: QueryPayrollEntriesDto) {
    await this.ensureBatch(batchId);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const where: Prisma.AiPayrollEntryWhereInput = {
      page: { document: { doc_batch_id: batchId } },
      ...(query.formType ? { entry_form_type: query.formType } : {}),
      ...(query.status ? { entry_status: query.status } : {}),
      ...(query.employeeId ? { entry_employee_id: query.employeeId } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.aiPayrollEntry.findMany({
        where,
        include: { fields: true, page: true },
        orderBy: [{ entry_work_date: 'asc' }, { entry_row_number: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.aiPayrollEntry.count({ where }),
    ]);
    return { data, total, page, pageSize };
  }

  async getEntry(entryId: number) {
    const entry = await this.prisma.aiPayrollEntry.findUnique({
      where: { id: entryId },
      include: { fields: true, page: { include: { document: true } }, run: true },
    });
    if (!entry) throw new NotFoundException('entry 不存在');
    return entry;
  }

  async updateField(entryId: number, fieldId: number, dto: UpdateEntryFieldDto, userId: number) {
    const field = await this.prisma.aiPayrollEntryField.findFirst({
      where: { id: fieldId, field_entry_id: entryId },
      include: { entry: true },
    });
    if (!field) throw new NotFoundException('欄位不存在');
    const previousValue = field.field_confirmed_value ?? field.field_normalized_value ?? field.field_raw_text ?? undefined;
    const flags = this.mergeFlags(field.field_flags, { correctionReason: dto.reason ?? null, correctedAt: new Date().toISOString() });
    const updated = await this.prisma.aiPayrollEntryField.update({
      where: { id: fieldId },
      data: {
        field_confirmed_value: dto.correctedValue,
        field_is_confirmed: true,
        field_confirmed_by: userId,
        field_confirmed_at: new Date(),
        field_flags: flags as Prisma.InputJsonValue,
      },
    });
    await this.prisma.aiPayrollEntry.update({ where: { id: entryId }, data: { entry_status: 'needs_confirmation' } });
    if (previousValue !== dto.correctedValue) {
      await this.candidateService.createCandidateFromCorrection({
        moduleCode: 'ai-payroll',
        taskType: field.entry.entry_form_type,
        sourceEntityType: 'ai_payroll_entry_field',
        sourceEntityId: fieldId,
        fieldName: field.field_name,
        beforeValue: previousValue,
        afterValue: dto.correctedValue,
        confirmedBy: userId,
        summary: dto.reason,
        extraPayload: { entryId, pageId: field.entry.entry_page_id },
      });
    }
    return updated;
  }

  async matchEmployee(entryId: number, dto: MatchEmployeeDto, userId: number) {
    await this.getEntry(entryId);
    return this.prisma.aiPayrollEntry.update({
      where: { id: entryId },
      data: {
        entry_employee_id: dto.employeeId,
        entry_flags: { employeeMatchReason: dto.reason ?? null, matchedBy: userId, matchedAt: new Date().toISOString() } as Prisma.InputJsonValue,
      },
      include: { fields: true },
    });
  }

  async excludeEntry(entryId: number, dto: ExcludeEntryDto, userId: number) {
    await this.getEntry(entryId);
    return this.prisma.aiPayrollEntry.update({
      where: { id: entryId },
      data: {
        entry_status: 'excluded',
        entry_flags: { excludeReason: dto.reason ?? null, excludedBy: userId, excludedAt: new Date().toISOString() } as Prisma.InputJsonValue,
      },
    });
  }

  async confirmPage(pageId: number, reason: string | undefined, userId: number) {
    const entries = await this.prisma.aiPayrollEntry.findMany({ where: { entry_page_id: pageId }, include: { fields: true } });
    if (entries.length === 0) throw new NotFoundException('此頁未有可確認的識別資料');
    const entryIds = entries.map((entry) => entry.id);
    await this.prisma.aiPayrollEntryField.updateMany({
      where: { field_entry_id: { in: entryIds } },
      data: { field_is_confirmed: true, field_confirmed_by: userId, field_confirmed_at: new Date() },
    });
    await this.prisma.aiPayrollEntry.updateMany({ where: { id: { in: entryIds } }, data: { entry_status: 'confirmed' } });
    await this.prisma.aiPayrollPage.update({ where: { id: pageId }, data: { page_status: 'confirmed' } });
    return { pageId, confirmedEntries: entryIds.length, reason };
  }

  async getBatchStats(batchId: number) {
    const batch = await this.ensureBatch(batchId);
    const pageStatuses = await this.prisma.aiPayrollPage.groupBy({
      by: ['page_status'],
      where: { document: { doc_batch_id: batchId } },
      _count: { _all: true },
    });
    const entryStatuses = await this.prisma.aiPayrollEntry.groupBy({
      by: ['entry_status'],
      where: { page: { document: { doc_batch_id: batchId } } },
      _count: { _all: true },
    });
    const fields = await this.prisma.aiPayrollEntryField.findMany({
      where: { entry: { page: { document: { doc_batch_id: batchId } } } },
      select: { field_confidence: true, field_is_confirmed: true },
    });
    const distribution = { high: 0, medium: 0, low: 0, confirmed: 0, unconfirmed: 0 };
    fields.forEach((field) => {
      const confidence = Number(field.field_confidence);
      if (confidence >= 85) distribution.high += 1;
      else if (confidence >= 70) distribution.medium += 1;
      else distribution.low += 1;
      if (field.field_is_confirmed) distribution.confirmed += 1;
      else distribution.unconfirmed += 1;
    });
    return {
      batchId,
      batchStatus: batch.batch_status,
      pages: this.groupByCount(pageStatuses, 'page_status'),
      entries: this.groupByCount(entryStatuses, 'entry_status'),
      fieldConfidenceDistribution: distribution,
    };
  }

  private async createPagesForDocument(file: Express.Multer.File, documentId: number, formTypeHint: string): Promise<string[]> {
    if (file.mimetype === 'application/pdf' || extname(file.originalname).toLowerCase() === '.pdf') {
      const pageImagePaths = await this.extractionService.splitPdfIntoPageImages(file.path, PAGE_DIR);
      await this.createPageRecords(documentId, pageImagePaths, formTypeHint);
      return pageImagePaths;
    }
    const targetPath = join(PAGE_DIR, basename(file.path));
    if (file.path !== targetPath) copyFileSync(file.path, targetPath);
    await this.createPageRecords(documentId, [targetPath], formTypeHint);
    return [targetPath];
  }

  private async createPageRecords(documentId: number, absolutePaths: string[], formTypeHint: string) {
    await this.prisma.aiPayrollPage.createMany({
      data: absolutePaths.map((path, index) => ({
        page_document_id: documentId,
        page_number: index + 1,
        page_image_path: this.toRelativePath(path),
        page_form_type: formTypeHint === 'auto' || formTypeHint === 'mixed' ? undefined : formTypeHint,
        page_status: 'pending',
      })),
    });
  }

  private async ensureBatch(batchId: number) {
    const batch = await this.prisma.aiPayrollBatch.findUnique({ where: { id: batchId } });
    if (!batch) throw new NotFoundException('批次不存在');
    return batch;
  }

  private parseJobBatchId(jobId: string): number {
    const match = /^job_(\d+)$/.exec(jobId);
    if (!match) throw new BadRequestException('jobId 格式不正確');
    return Number(match[1]);
  }

  private toRelativePath(path: string): string {
    return relative(process.cwd(), path).replace(/\\/g, '/');
  }

  private mergeFlags(current: Prisma.JsonValue, updates: JsonRecord): JsonRecord {
    const base = current && typeof current === 'object' && !Array.isArray(current) ? current as JsonRecord : {};
    return { ...base, ...updates };
  }

  private groupByCount<T extends string>(rows: Array<Record<T, string> & { _count: { _all: number } }>, key: T): Record<string, number> {
    return rows.reduce<Record<string, number>>((acc, row) => {
      acc[row[key]] = row._count._all;
      return acc;
    }, {});
  }
}
