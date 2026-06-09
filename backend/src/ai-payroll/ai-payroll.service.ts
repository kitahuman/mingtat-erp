import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
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
type PayrollEntryWithFields = Prisma.AiPayrollEntryGetPayload<{
  include: { fields: true };
}>;

@Injectable()
export class AiPayrollService {
  private readonly logger = new Logger(AiPayrollService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly extractionService: AiPayrollExtractionService,
    private readonly candidateService: AiKnowledgeCandidateService,
  ) {}

  async createBatch(dto: CreateAiPayrollBatchDto, userId: number) {
    const batchPayrollMonth = dto.payroll_month.trim();
    const notes = [
      dto.notes,
      dto.expected_pay_date
        ? `預計出糧日：${dto.expected_pay_date}`
        : undefined,
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
      ...(query.payrollMonth
        ? { batch_payroll_month: query.payrollMonth }
        : {}),
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
          include: {
            pages: {
              include: { entries: { include: { fields: true } } },
              orderBy: { page_number: 'asc' },
            },
          },
          orderBy: { doc_created_at: 'desc' },
        },
      },
    });
    if (!batch) throw new NotFoundException('批次不存在');
    return batch;
  }

  async updateBatch(
    batchId: number,
    dto: Record<string, unknown>,
    _userId: number,
  ) {
    await this.ensureBatch(batchId);
    const data: Prisma.AiPayrollBatchUpdateInput = {};

    const payrollMonth = this.firstString(dto, [
      'payroll_month',
      'payrollMonth',
      'batch_payroll_month',
    ]);
    if (payrollMonth !== undefined)
      data.batch_payroll_month = payrollMonth.trim();

    const payrollPeriod = this.firstString(dto, [
      'payroll_period',
      'payrollPeriod',
      'batch_period',
    ]);
    if (payrollPeriod !== undefined) data.batch_period = payrollPeriod;

    const defaultFormType = this.firstString(dto, [
      'default_form_type',
      'defaultFormType',
      'batch_form_type_default',
    ]);
    if (defaultFormType !== undefined)
      data.batch_form_type_default = defaultFormType;

    const status = this.firstString(dto, ['status', 'batch_status']);
    if (status !== undefined) data.batch_status = status;

    const notes = this.firstString(dto, ['notes', 'batch_notes']);
    if (notes !== undefined) data.batch_notes = notes;

    if (Object.keys(data).length === 0) return this.getBatch(batchId);
    await this.prisma.aiPayrollBatch.update({ where: { id: batchId }, data });
    return this.getBatch(batchId);
  }

  async exportBatch(batchId: number) {
    const batch = await this.getBatch(batchId);
    const entries = await this.prisma.aiPayrollEntry.findMany({
      where: { page: { document: { doc_batch_id: batchId } } },
      include: { fields: true, page: { include: { document: true } } },
      orderBy: [
        { entry_work_date: 'asc' },
        { entry_page_id: 'asc' },
        { entry_row_number: 'asc' },
      ],
    });

    const fieldNames = Array.from(
      new Set(
        entries.flatMap((entry) =>
          entry.fields.map((field) => field.field_name),
        ),
      ),
    );
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Ming Tat ERP';
    workbook.created = new Date();

    const summary = workbook.addWorksheet('Summary');
    summary.columns = [
      { header: 'Field', key: 'field', width: 28 },
      { header: 'Value', key: 'value', width: 50 },
    ];
    summary.addRows([
      { field: 'Batch ID', value: batch.id },
      { field: 'Payroll Month', value: batch.batch_payroll_month },
      { field: 'Period', value: batch.batch_period ?? '' },
      { field: 'Status', value: batch.batch_status },
      { field: 'Documents', value: batch.documents?.length ?? 0 },
      { field: 'Exported At', value: new Date().toISOString() },
    ]);

    const sheet = workbook.addWorksheet('Entries');
    sheet.columns = [
      { header: 'Entry ID', key: 'entry_id', width: 12 },
      { header: 'Page ID', key: 'page_id', width: 12 },
      { header: 'Document', key: 'document', width: 35 },
      { header: 'Page No.', key: 'page_no', width: 10 },
      { header: 'Row No.', key: 'row_no', width: 10 },
      { header: 'Work Date', key: 'work_date', width: 14 },
      { header: 'Employee ID', key: 'employee_id', width: 14 },
      { header: 'Employee Name', key: 'employee_name', width: 18 },
      { header: 'Form Type', key: 'form_type', width: 18 },
      { header: 'Status', key: 'status', width: 16 },
      { header: 'Confidence', key: 'confidence', width: 12 },
      ...fieldNames.map((fieldName) => ({
        header: fieldName,
        key: `field_${fieldName}`,
        width: 20,
      })),
    ];

    entries.forEach((entry) => {
      const fieldValues = this.entryFieldsToData(entry.fields);
      const row: Record<string, unknown> = {
        entry_id: entry.id,
        page_id: entry.entry_page_id,
        document: entry.page.document.doc_original_filename,
        page_no: entry.page.page_number,
        row_no: entry.entry_row_number ?? '',
        work_date: entry.entry_work_date
          ? entry.entry_work_date.toISOString().slice(0, 10)
          : '',
        employee_id: entry.entry_employee_id ?? '',
        employee_name: entry.entry_employee_name_raw ?? '',
        form_type: entry.entry_form_type,
        status: entry.entry_status,
        confidence: entry.entry_overall_confidence?.toString() ?? '',
      };
      fieldNames.forEach((fieldName) => {
        row[`field_${fieldName}`] = fieldValues[fieldName] ?? '';
      });
      sheet.addRow(row);
    });

    [summary, sheet].forEach((worksheet) => {
      worksheet.getRow(1).font = { bold: true };
      worksheet.views = [{ state: 'frozen', ySplit: 1 }];
    });

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const safeMonth = batch.batch_payroll_month.replace(/[^0-9A-Za-z_-]/g, '_');
    return { buffer, filename: `ai-payroll-${batch.id}-${safeMonth}.xlsx` };
  }

  async uploadDocument(
    batchId: number,
    file: Express.Multer.File,
    dto: UploadPayrollDocumentDto,
    userId: number,
  ) {
    const batch = await this.prisma.aiPayrollBatch.findUnique({
      where: { id: batchId },
    });
    if (!batch) throw new NotFoundException('批次不存在');
    if (!file) throw new BadRequestException('請選擇文件');

    mkdirSync(DOCUMENT_DIR, { recursive: true });
    mkdirSync(PAGE_DIR, { recursive: true });
    const storedPath = this.toRelativePath(file.path);
    const document = await this.prisma.aiPayrollDocument.create({
      data: {
        doc_batch_id: batchId,
        doc_original_filename: Buffer.from(
          file.originalname,
          'latin1',
        ).toString('utf8'),
        doc_storage_path: storedPath,
        doc_mime_type: file.mimetype,
        doc_file_size: file.size,
        doc_quality_score: 80,
        doc_quality_issues: [] as Prisma.InputJsonValue,
        doc_uploaded_by: userId,
      },
    });

    const pagePaths = await this.createPagesForDocument(
      file,
      document.id,
      dto.formTypeHint ?? batch.batch_form_type_default,
    );
    await this.prisma.aiPayrollDocument.update({
      where: { id: document.id },
      data: { doc_page_count: pagePaths.length, doc_status: 'ready' },
    });
    await this.prisma.aiPayrollBatch.update({
      where: { id: batchId },
      data: { batch_status: 'uploaded' },
    });
    return this.prisma.aiPayrollDocument.findUnique({
      where: { id: document.id },
      include: { pages: true },
    });
  }

  async listDocuments(batchId: number) {
    await this.ensureBatch(batchId);
    return this.prisma.aiPayrollDocument.findMany({
      where: { doc_batch_id: batchId },
      include: { pages: { orderBy: { page_number: 'asc' } } },
      orderBy: { doc_created_at: 'desc' },
    });
  }

  async listPages(batchId: number) {
    await this.ensureBatch(batchId);
    return this.prisma.aiPayrollPage.findMany({
      where: { document: { doc_batch_id: batchId } },
      include: { document: { select: { doc_original_filename: true } } },
      orderBy: [{ page_document_id: 'asc' }, { page_number: 'asc' }],
    });
  }

  async startExtractionJob(batchId: number, dto: StartExtractionJobDto) {
    await this.ensureBatch(batchId);
    await this.prisma.aiPayrollBatch.update({
      where: { id: batchId },
      data: { batch_status: 'processing' },
    });
    const pages = await this.prisma.aiPayrollPage.findMany({
      where: {
        document: { doc_batch_id: batchId },
        ...(dto.pageIds?.length ? { id: { in: dto.pageIds } } : {}),
      },
      orderBy: [{ page_document_id: 'asc' }, { page_number: 'asc' }],
    });
    const results: Array<
      | Awaited<ReturnType<AiPayrollExtractionService['extractPage']>>
      | { pageId: number; status: 'failed'; errorMessage: string }
    > = [];
    const failedPageIds: number[] = [];
    for (const page of pages) {
      try {
        results.push(
          await this.extractionService.extractPage(
            page.id,
            dto.formTypeOverride,
            dto.forceReExtract ?? false,
          ),
        );
      } catch (error) {
        const message = this.getErrorMessage(error);
        failedPageIds.push(page.id);
        await this.prisma.aiPayrollPage.update({
          where: { id: page.id },
          data: {
            page_status: 'failed',
          },
        });
        this.logger.warn(
          `AI payroll OCR failed for page ${page.id} in batch ${batchId}: ${message}`,
        );
        results.push({ pageId: page.id, status: 'failed', errorMessage: message });
      }
    }
    const failed = await this.prisma.aiPayrollPage.count({
      where: { document: { doc_batch_id: batchId }, page_status: 'failed' },
    });
    await this.prisma.aiPayrollBatch.update({
      where: { id: batchId },
      data: { batch_status: failed > 0 ? 'partially_failed' : 'extracted' },
    });
    return {
      jobId: `job_${batchId}`,
      batchId,
      status: failed > 0 ? 'partially_failed' : 'completed',
      estimatedPages: pages.length,
      failedPages: failedPageIds.length,
      results,
    };
  }

  async getExtractionJob(jobId: string) {
    const batchId = this.parseJobBatchId(jobId);
    const stats = await this.getBatchStats(batchId);
    return { jobId, batchId, status: stats.batchStatus, stats };
  }

  async reExtractPage(pageId: number, dto: StartExtractionJobDto) {
    const result = await this.extractionService.extractPage(
      pageId,
      dto.formTypeOverride,
      true,
    );
    return result;
  }

  async getPage(pageId: number) {
    const page = await this.prisma.aiPayrollPage.findUnique({
      where: { id: pageId },
      include: {
        document: { include: { batch: true } },
        entries: {
          include: { fields: true },
          orderBy: [{ entry_row_number: 'asc' }, { id: 'asc' }],
        },
      },
    });
    if (!page) throw new NotFoundException('頁面不存在');
    const imageUrl = this.toPublicUploadUrl(page.page_image_path);
    return {
      ...page,
      page_id: page.id,
      batch_id: page.document.doc_batch_id,
      status: page.page_status,
      image_url: imageUrl,
      page_image_url: imageUrl,
      entries: page.entries.map((entry) => this.formatEntry(entry)),
    };
  }

  async listPageEntries(pageId: number) {
    const page = await this.prisma.aiPayrollPage.findUnique({
      where: { id: pageId },
    });
    if (!page) throw new NotFoundException('頁面不存在');
    const entries = await this.prisma.aiPayrollEntry.findMany({
      where: { entry_page_id: pageId },
      include: { fields: true },
      orderBy: [{ entry_row_number: 'asc' }, { id: 'asc' }],
    });
    return entries.map((entry) => this.formatEntry(entry));
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
      include: {
        fields: true,
        page: { include: { document: true } },
        run: true,
      },
    });
    if (!entry) throw new NotFoundException('entry 不存在');
    return entry;
  }

  async updateField(
    entryId: number,
    fieldId: number,
    dto: UpdateEntryFieldDto,
    userId: number,
  ) {
    const field = await this.prisma.aiPayrollEntryField.findFirst({
      where: { id: fieldId, field_entry_id: entryId },
      include: { entry: true },
    });
    if (!field) throw new NotFoundException('欄位不存在');
    const previousValue =
      field.field_confirmed_value ??
      field.field_normalized_value ??
      field.field_raw_text ??
      undefined;
    const flags = this.mergeFlags(field.field_flags, {
      correctionReason: dto.reason ?? null,
      correctedAt: new Date().toISOString(),
    });
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
    await this.prisma.aiPayrollEntry.update({
      where: { id: entryId },
      data: { entry_status: 'needs_confirmation' },
    });
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

  async updateEntry(
    entryId: number,
    dto: Record<string, unknown>,
    userId: number,
  ) {
    const entry = await this.getEntry(entryId);
    const confirmedData = this.asJsonRecord(
      dto.confirmed_data ?? dto.confirmedData ?? dto.data ?? dto.payload,
    );
    const corrections = this.asJsonRecord(dto.corrections);
    const values =
      Object.keys(confirmedData).length > 0 ? confirmedData : corrections;

    for (const [fieldName, value] of Object.entries(values)) {
      const serialized = this.serializeFieldValue(value);
      const existing = entry.fields.find(
        (field) => field.field_name === fieldName,
      );
      if (existing) {
        const previousValue =
          existing.field_confirmed_value ??
          existing.field_normalized_value ??
          existing.field_raw_text ??
          undefined;
        await this.prisma.aiPayrollEntryField.update({
          where: { id: existing.id },
          data: {
            field_confirmed_value: serialized,
            field_is_confirmed: true,
            field_confirmed_by: userId,
            field_confirmed_at: new Date(),
            field_flags: this.mergeFlags(existing.field_flags, {
              correctedAt: new Date().toISOString(),
            }) as Prisma.InputJsonValue,
          },
        });
        if (
          Object.prototype.hasOwnProperty.call(corrections, fieldName) &&
          previousValue !== serialized
        ) {
          await this.candidateService.createCandidateFromCorrection({
            moduleCode: 'ai-payroll',
            taskType: entry.entry_form_type,
            sourceEntityType: 'ai_payroll_entry_field',
            sourceEntityId: existing.id,
            fieldName,
            beforeValue: previousValue,
            afterValue: serialized,
            confirmedBy: userId,
            extraPayload: { entryId, pageId: entry.entry_page_id },
          });
        }
      } else {
        await this.prisma.aiPayrollEntryField.create({
          data: {
            field_entry_id: entryId,
            field_name: fieldName.slice(0, 50),
            field_raw_text: serialized,
            field_normalized_value: serialized,
            field_confidence: 100,
            field_is_confirmed: true,
            field_confirmed_value: serialized,
            field_confirmed_by: userId,
            field_confirmed_at: new Date(),
            field_flags: {
              createdFromEntryUpdate: true,
              correctedAt: new Date().toISOString(),
            } as Prisma.InputJsonValue,
          },
        });
      }
    }

    const data: Prisma.AiPayrollEntryUpdateInput = {};
    const status = this.firstString(dto, ['status', 'entry_status']);
    if (status !== undefined) data.entry_status = status;
    if (
      dto.employee_id !== undefined ||
      dto.employeeId !== undefined ||
      dto.entry_employee_id !== undefined
    ) {
      data.entry_employee_id = this.firstNumber(dto, [
        'employee_id',
        'employeeId',
        'entry_employee_id',
      ]);
    }
    if (
      dto.employee_name !== undefined ||
      dto.entry_employee_name_raw !== undefined
    ) {
      data.entry_employee_name_raw = this.firstString(dto, [
        'employee_name',
        'entry_employee_name_raw',
      ]);
    }
    if (dto.mark_confirmed === true || dto.markConfirmed === true)
      data.entry_status = 'confirmed';
    if (Object.keys(values).length > 0 && data.entry_status === undefined)
      data.entry_status = 'needs_confirmation';
    if (Object.keys(data).length > 0)
      await this.prisma.aiPayrollEntry.update({ where: { id: entryId }, data });
    return this.getEntry(entryId);
  }

  async confirmEntry(
    entryId: number,
    dto: Record<string, unknown>,
    userId: number,
  ) {
    const updated = await this.updateEntry(
      entryId,
      { ...dto, mark_confirmed: true },
      userId,
    );
    await this.prisma.aiPayrollEntryField.updateMany({
      where: { field_entry_id: entryId },
      data: {
        field_is_confirmed: true,
        field_confirmed_by: userId,
        field_confirmed_at: new Date(),
      },
    });
    await this.prisma.aiPayrollEntry.update({
      where: { id: entryId },
      data: { entry_status: 'confirmed' },
    });
    return this.getEntry(entryId);
  }

  async matchEmployee(entryId: number, dto: MatchEmployeeDto, userId: number) {
    await this.getEntry(entryId);
    return this.prisma.aiPayrollEntry.update({
      where: { id: entryId },
      data: {
        entry_employee_id: dto.employeeId,
        entry_flags: {
          employeeMatchReason: dto.reason ?? null,
          matchedBy: userId,
          matchedAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
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
        entry_flags: {
          excludeReason: dto.reason ?? null,
          excludedBy: userId,
          excludedAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      },
    });
  }

  async confirmPage(
    pageId: number,
    reason: string | undefined,
    userId: number,
  ) {
    const entries = await this.prisma.aiPayrollEntry.findMany({
      where: { entry_page_id: pageId },
      include: { fields: true },
    });
    if (entries.length === 0)
      throw new NotFoundException('此頁未有可確認的識別資料');
    const entryIds = entries.map((entry) => entry.id);
    await this.prisma.aiPayrollEntryField.updateMany({
      where: { field_entry_id: { in: entryIds } },
      data: {
        field_is_confirmed: true,
        field_confirmed_by: userId,
        field_confirmed_at: new Date(),
      },
    });
    await this.prisma.aiPayrollEntry.updateMany({
      where: { id: { in: entryIds } },
      data: { entry_status: 'confirmed' },
    });
    await this.prisma.aiPayrollPage.update({
      where: { id: pageId },
      data: { page_status: 'confirmed' },
    });
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
    const distribution = {
      high: 0,
      medium: 0,
      low: 0,
      confirmed: 0,
      unconfirmed: 0,
    };
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

  private async createPagesForDocument(
    file: Express.Multer.File,
    documentId: number,
    formTypeHint: string,
  ): Promise<string[]> {
    if (
      file.mimetype === 'application/pdf' ||
      extname(file.originalname).toLowerCase() === '.pdf'
    ) {
      const pageImagePaths =
        await this.extractionService.splitPdfIntoPageImages(
          file.path,
          PAGE_DIR,
        );
      await this.createPageRecords(documentId, pageImagePaths, formTypeHint);
      return pageImagePaths;
    }
    const targetPath = join(PAGE_DIR, basename(file.path));
    if (file.path !== targetPath) copyFileSync(file.path, targetPath);
    await this.createPageRecords(documentId, [targetPath], formTypeHint);
    return [targetPath];
  }

  private async createPageRecords(
    documentId: number,
    absolutePaths: string[],
    formTypeHint: string,
  ) {
    await this.prisma.aiPayrollPage.createMany({
      data: absolutePaths.map((path, index) => ({
        page_document_id: documentId,
        page_number: index + 1,
        page_image_path: this.toRelativePath(path),
        page_form_type:
          formTypeHint === 'auto' || formTypeHint === 'mixed'
            ? undefined
            : formTypeHint,
        page_status: 'pending',
      })),
    });
  }

  private async ensureBatch(batchId: number) {
    const batch = await this.prisma.aiPayrollBatch.findUnique({
      where: { id: batchId },
    });
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

  private toPublicUploadUrl(path: string): string {
    const normalized = path.replace(/\\/g, '/');
    return normalized.startsWith('/') ? normalized : `/${normalized}`;
  }

  private formatEntry(entry: PayrollEntryWithFields) {
    const extractedData = this.entryFieldsToData(entry.fields);
    const confidenceByField = entry.fields.reduce<Record<string, number>>(
      (acc, field) => {
        acc[field.field_name] = Number(field.field_confidence);
        return acc;
      },
      {},
    );
    return {
      ...entry,
      entry_id: entry.id,
      page_id: entry.entry_page_id,
      status: entry.entry_status,
      overall_confidence: entry.entry_overall_confidence
        ? Number(entry.entry_overall_confidence)
        : null,
      confidence_overall: entry.entry_overall_confidence
        ? Number(entry.entry_overall_confidence)
        : null,
      extracted_data: extractedData,
      confirmed_data: extractedData,
      payload: extractedData,
      field_confidence: confidenceByField,
    };
  }

  private entryFieldsToData(
    fields: Array<{
      field_name: string;
      field_confirmed_value: string | null;
      field_normalized_value: string | null;
      field_raw_text: string | null;
    }>,
  ) {
    return fields.reduce<Record<string, string>>((acc, field) => {
      acc[field.field_name] =
        field.field_confirmed_value ??
        field.field_normalized_value ??
        field.field_raw_text ??
        '';
      return acc;
    }, {});
  }

  private asJsonRecord(value: unknown): JsonRecord {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as JsonRecord)
      : {};
  }

  private firstString(
    source: Record<string, unknown>,
    keys: string[],
  ): string | undefined {
    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'string') return value;
      if (value !== undefined && value !== null) return String(value);
    }
    return undefined;
  }

  private firstNumber(
    source: Record<string, unknown>,
    keys: string[],
  ): number | null {
    for (const key of keys) {
      const value = source[key];
      if (value === undefined || value === null || value === '') continue;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  private serializeFieldValue(value: unknown): string {
    if (value === undefined || value === null) return '';
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  }

  private mergeFlags(
    current: Prisma.JsonValue,
    updates: JsonRecord,
  ): JsonRecord {
    const base =
      current && typeof current === 'object' && !Array.isArray(current)
        ? (current as JsonRecord)
        : {};
    return { ...base, ...updates };
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) return error.message;
    if (typeof error === 'string' && error.trim()) return error;
    return 'AI 未能從文件中讀取資料，請檢查文件格式';
  }

  private groupByCount<T extends string>(
    rows: Array<Record<T, string> & { _count: { _all: number } }>,
    key: T,
  ): Record<string, number> {
    return rows.reduce<Record<string, number>>((acc, row) => {
      acc[row[key]] = row._count._all;
      return acc;
    }, {});
  }
}
