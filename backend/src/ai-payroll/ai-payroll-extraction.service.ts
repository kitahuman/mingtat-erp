import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { basename, extname, join, resolve } from 'path';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { PrismaService } from '../prisma/prisma.service';
import { createOpenAIClient } from '../common/openai-client';
import { AiKnowledgeService } from '../ai-knowledge/ai-knowledge.service';

const MODEL_NAME = 'gpt-4.1';
const PROMPT_VERSION = 'ai-payroll-v1';
const SCHEMA_VERSION = 'ai-payroll-extraction-v1';

type JsonRecord = Record<string, unknown>;

interface PdfToImgModule {
  pdf: (filePath: string, options: { scale: number }) => Promise<AsyncIterable<Buffer>>;
}

interface ExtractedField {
  fieldName: string;
  rawText?: string | null;
  normalizedValue?: string | null;
  confidence: number;
  bbox?: JsonRecord | null;
  flags?: JsonRecord | null;
}

interface ExtractedEntry {
  rowNumber?: number | null;
  workDate?: string | null;
  employeeNameRaw?: string | null;
  employeeId?: number | null;
  overallConfidence?: number | null;
  flags?: JsonRecord | null;
  fields: ExtractedField[];
}

interface ExtractionResult {
  formType: 'attendance_sheet' | 'daily_report' | 'unknown';
  formTypeConfidence: number;
  employeeNameHint?: string | null;
  employeeId?: number | null;
  entries: ExtractedEntry[];
}

@Injectable()
export class AiPayrollExtractionService {
  private readonly openai = createOpenAIClient();

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiKnowledgeService: AiKnowledgeService,
  ) {}

  async extractPage(pageId: number, formTypeOverride?: string, forceReExtract = false) {
    const page = await this.prisma.aiPayrollPage.findUnique({
      where: { id: pageId },
      include: { document: { include: { batch: true } } },
    });
    if (!page) throw new NotFoundException('頁面不存在');
    if (!forceReExtract && page.page_status === 'extracted') {
      return { pageId, skipped: true, reason: 'already_extracted' };
    }

    await this.prisma.aiPayrollPage.update({ where: { id: pageId }, data: { page_status: 'processing' } });
    const startedAt = Date.now();
    const imagePath = this.resolveUploadPath(page.page_image_path);
    if (!existsSync(imagePath)) throw new BadRequestException('頁面圖片不存在');
    const imageBuffer = readFileSync(imagePath);
    const imageHash = createHash('sha256').update(imageBuffer).digest('hex');
    const formType = formTypeOverride && formTypeOverride !== 'auto' ? formTypeOverride : page.page_form_type ?? page.document.batch.batch_form_type_default;

    const knowledge = await this.aiKnowledgeService.retrieve({
      moduleCode: 'ai-payroll',
      taskType: 'payroll_vision_extraction',
      context: {
        formType: formType === 'mixed' ? 'auto' : formType,
        rawTexts: [page.document.doc_original_filename, page.document.batch.batch_payroll_month],
        fieldNames: this.getExpectedFieldNames(formType),
      },
      limits: { maxEntries: 12, maxPromptCharacters: 3500 },
    });

    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: this.buildSystemPrompt(formType, knowledge.entries.map((entry) => entry.promptSnippet)) },
      {
        role: 'user',
        content: [
          { type: 'text', text: `請識別此 AI 計糧文件頁面。文件：${page.document.doc_original_filename}，頁碼：${page.page_number}。` },
          { type: 'image_url', image_url: { url: `data:${this.getImageMimeType(imagePath)};base64,${imageBuffer.toString('base64')}`, detail: 'high' } },
        ],
      },
    ];

    let runId = 0;
    try {
      const response = await this.openai.chat.completions.create({
        model: MODEL_NAME,
        messages,
        temperature: 0,
        max_tokens: 10000,
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'ai_payroll_extraction', strict: true, schema: this.getExtractionJsonSchema() },
        },
      });
      const result = this.parseExtractionResponse(response.choices[0]?.message?.content ?? '');
      const rawResponse = JSON.parse(JSON.stringify(response)) as Prisma.InputJsonValue;
      const run = await this.prisma.aiPayrollExtractionRun.create({
        data: {
          run_page_id: pageId,
          run_model_name: MODEL_NAME,
          run_prompt_version: PROMPT_VERSION,
          run_schema_version: SCHEMA_VERSION,
          run_input_image_hash: imageHash,
          run_raw_response: rawResponse,
          run_token_usage: (response.usage ? JSON.parse(JSON.stringify(response.usage)) : undefined) as Prisma.InputJsonValue | undefined,
          run_duration_ms: Date.now() - startedAt,
          run_status: 'completed',
        },
      });
      runId = run.id;
      if (forceReExtract) await this.deletePageEntries(pageId);
      await this.persistExtractionResult(pageId, run.id, result);
      await this.prisma.aiPayrollPage.update({
        where: { id: pageId },
        data: {
          page_status: 'extracted',
          page_form_type: result.formType,
          page_form_type_confidence: result.formTypeConfidence,
          page_employee_name_hint: result.employeeNameHint ?? undefined,
          page_employee_id: result.employeeId ?? undefined,
        },
      });
      return { pageId, runId: run.id, status: 'completed', entries: result.entries.length, knowledgeContextId: knowledge.knowledgeContextId };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '未知錯誤';
      if (runId === 0) {
        await this.prisma.aiPayrollExtractionRun.create({
          data: {
            run_page_id: pageId,
            run_model_name: MODEL_NAME,
            run_prompt_version: PROMPT_VERSION,
            run_schema_version: SCHEMA_VERSION,
            run_raw_response: { error: message } as Prisma.InputJsonValue,
            run_duration_ms: Date.now() - startedAt,
            run_status: 'failed',
            run_error_message: message,
          },
        });
      }
      await this.prisma.aiPayrollPage.update({ where: { id: pageId }, data: { page_status: 'failed' } });
      throw new BadRequestException(`AI 識別失敗：${message}`);
    }
  }

  async splitPdfIntoPageImages(filePath: string, outputDir: string): Promise<string[]> {
    mkdirSync(outputDir, { recursive: true });
    const module = await import('pdf-to-img') as unknown as PdfToImgModule;
    const document = await module.pdf(filePath, { scale: 2.5 });
    const outputPaths: string[] = [];
    let pageNumber = 1;
    const baseName = basename(filePath, extname(filePath));
    for await (const pageBuffer of document) {
      const outputPath = join(outputDir, `${baseName}_page_${pageNumber}.png`);
      writeFileSync(outputPath, pageBuffer);
      outputPaths.push(outputPath);
      pageNumber += 1;
    }
    return outputPaths;
  }

  private async deletePageEntries(pageId: number) {
    const entries = await this.prisma.aiPayrollEntry.findMany({ where: { entry_page_id: pageId }, select: { id: true } });
    const entryIds = entries.map((entry) => entry.id);
    if (entryIds.length === 0) return;
    await this.prisma.aiPayrollEntryField.deleteMany({ where: { field_entry_id: { in: entryIds } } });
    await this.prisma.aiPayrollEntry.deleteMany({ where: { id: { in: entryIds } } });
  }

  private async persistExtractionResult(pageId: number, runId: number, result: ExtractionResult) {
    for (const entry of result.entries) {
      const createdEntry = await this.prisma.aiPayrollEntry.create({
        data: {
          entry_page_id: pageId,
          entry_run_id: runId,
          entry_row_number: entry.rowNumber ?? undefined,
          entry_work_date: entry.workDate ? new Date(entry.workDate) : undefined,
          entry_employee_id: entry.employeeId ?? undefined,
          entry_employee_name_raw: entry.employeeNameRaw ?? result.employeeNameHint ?? undefined,
          entry_form_type: result.formType,
          entry_status: this.needsConfirmation(entry) ? 'needs_confirmation' : 'extracted',
          entry_overall_confidence: entry.overallConfidence ?? this.averageConfidence(entry.fields),
          entry_flags: (entry.flags ?? {}) as Prisma.InputJsonValue,
        },
      });
      if (entry.fields.length > 0) {
        await this.prisma.aiPayrollEntryField.createMany({
          data: entry.fields.map((field) => ({
            field_entry_id: createdEntry.id,
            field_name: field.fieldName,
            field_raw_text: field.rawText ?? undefined,
            field_normalized_value: field.normalizedValue ?? undefined,
            field_confidence: field.confidence,
            field_bbox_json: (field.bbox ?? undefined) as Prisma.InputJsonValue | undefined,
            field_flags: (field.flags ?? {}) as Prisma.InputJsonValue,
            field_is_confirmed: field.confidence >= 85,
            field_confirmed_value: field.confidence >= 85 ? field.normalizedValue ?? field.rawText ?? undefined : undefined,
          })),
        });
      }
    }
  }

  private parseExtractionResponse(content: string): ExtractionResult {
    try {
      const parsed = JSON.parse(content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()) as JsonRecord;
      const entries = Array.isArray(parsed.entries) ? parsed.entries.map((entry) => this.parseEntry(entry)) : [];
      return {
        formType: this.normalizeFormType(parsed.formType),
        formTypeConfidence: this.normalizeConfidence(parsed.formTypeConfidence),
        employeeNameHint: typeof parsed.employeeNameHint === 'string' ? parsed.employeeNameHint : null,
        employeeId: typeof parsed.employeeId === 'number' ? parsed.employeeId : null,
        entries,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'JSON 解析錯誤';
      throw new BadRequestException(`AI 回應格式錯誤：${message}`);
    }
  }

  private parseEntry(value: unknown): ExtractedEntry {
    const record = value && typeof value === 'object' ? value as JsonRecord : {};
    const fields = Array.isArray(record.fields) ? record.fields.map((field) => this.parseField(field)) : [];
    return {
      rowNumber: typeof record.rowNumber === 'number' ? record.rowNumber : null,
      workDate: typeof record.workDate === 'string' ? record.workDate : null,
      employeeNameRaw: typeof record.employeeNameRaw === 'string' ? record.employeeNameRaw : null,
      employeeId: typeof record.employeeId === 'number' ? record.employeeId : null,
      overallConfidence: typeof record.overallConfidence === 'number' ? this.normalizeConfidence(record.overallConfidence) : null,
      flags: record.flags && typeof record.flags === 'object' && !Array.isArray(record.flags) ? record.flags as JsonRecord : {},
      fields,
    };
  }

  private parseField(value: unknown): ExtractedField {
    const record = value && typeof value === 'object' ? value as JsonRecord : {};
    return {
      fieldName: typeof record.fieldName === 'string' ? record.fieldName : 'unknown',
      rawText: typeof record.rawText === 'string' ? record.rawText : null,
      normalizedValue: typeof record.normalizedValue === 'string' ? record.normalizedValue : null,
      confidence: this.normalizeConfidence(record.confidence),
      bbox: record.bbox && typeof record.bbox === 'object' && !Array.isArray(record.bbox) ? record.bbox as JsonRecord : null,
      flags: record.flags && typeof record.flags === 'object' && !Array.isArray(record.flags) ? record.flags as JsonRecord : {},
    };
  }

  private buildSystemPrompt(formType: string, knowledgeSnippets: string[]): string {
    return `你是明達建築 ERP 的 AI 計糧文件識別助手。請從圖片中識別手寫功課紙或日報表，並只輸出符合 JSON schema 的資料。\n\n文件類型提示：${formType || 'auto'}\n\n功課紙 attendance_sheet 需要抽取：日期、員工姓名、公司、合約、地盤、開工時間、收工時間、加班時數、工作內容、備註、簽名、總工數參考。\n日報表 daily_report 需要抽取：日期、司機/員工姓名、車牌、寶號/公司、機種、From 地點、To 傾倒位置、簽單號碼、人帳票號碼、噸/車/日數、隧道、日/夜、備註/合同號碼及右側檢查欄。\n\n重要規則：每一列輸出一個 entry；每個欄位必須提供 0-100 confidence；如能定位，bbox 使用 {x,y,width,height,page}，座標按原圖比例 0-1；不確定欄位保留 rawText 並降低 confidence；不得憑空補資料。\n\n可用知識：\n${knowledgeSnippets.length ? knowledgeSnippets.join('\n---\n') : '無'}`;
  }

  private getExtractionJsonSchema(): JsonRecord {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['formType', 'formTypeConfidence', 'employeeNameHint', 'employeeId', 'entries'],
      properties: {
        formType: { type: 'string', enum: ['attendance_sheet', 'daily_report', 'unknown'] },
        formTypeConfidence: { type: 'number', minimum: 0, maximum: 100 },
        employeeNameHint: { type: ['string', 'null'] },
        employeeId: { type: ['number', 'null'] },
        entries: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['rowNumber', 'workDate', 'employeeNameRaw', 'employeeId', 'overallConfidence', 'flags', 'fields'],
            properties: {
              rowNumber: { type: ['number', 'null'] },
              workDate: { type: ['string', 'null'] },
              employeeNameRaw: { type: ['string', 'null'] },
              employeeId: { type: ['number', 'null'] },
              overallConfidence: { type: ['number', 'null'], minimum: 0, maximum: 100 },
              flags: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  inherited: { type: ['boolean', 'null'] },
                  ambiguous: { type: ['boolean', 'null'] },
                  multipleValues: { type: ['boolean', 'null'] },
                  lowVisibility: { type: ['boolean', 'null'] },
                  note: { type: ['string', 'null'] },
                },
                required: ['inherited', 'ambiguous', 'multipleValues', 'lowVisibility', 'note'],
              },
              fields: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['fieldName', 'rawText', 'normalizedValue', 'confidence', 'bbox', 'flags'],
                  properties: {
                    fieldName: { type: 'string' },
                    rawText: { type: ['string', 'null'] },
                    normalizedValue: { type: ['string', 'null'] },
                    confidence: { type: 'number', minimum: 0, maximum: 100 },
                    bbox: {
                      type: ['object', 'null'],
                      additionalProperties: false,
                      properties: {
                        x: { type: 'number' }, y: { type: 'number' }, width: { type: 'number' }, height: { type: 'number' }, page: { type: 'number' },
                      },
                    },
                    flags: {
                      type: 'object',
                      additionalProperties: false,
                      properties: {
                        inherited: { type: ['boolean', 'null'] },
                        ambiguous: { type: ['boolean', 'null'] },
                        multipleValues: { type: ['boolean', 'null'] },
                        lowVisibility: { type: ['boolean', 'null'] },
                        note: { type: ['string', 'null'] },
                      },
                      required: ['inherited', 'ambiguous', 'multipleValues', 'lowVisibility', 'note'],
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
  }

  private getExpectedFieldNames(formType: string): string[] {
    if (formType === 'daily_report') return ['date', 'driverName', 'vehiclePlate', 'company', 'machineType', 'fromLocation', 'toLocation', 'ticketNo', 'tonTripDayCount', 'dayNight', 'remarks'];
    return ['date', 'employeeName', 'company', 'contract', 'site', 'startTime', 'endTime', 'overtimeHours', 'workContent', 'remarks', 'signature'];
  }

  private needsConfirmation(entry: ExtractedEntry): boolean {
    return entry.fields.some((field) => field.confidence < 75) || (entry.overallConfidence ?? 100) < 75;
  }

  private averageConfidence(fields: ExtractedField[]): number {
    if (fields.length === 0) return 0;
    return Number((fields.reduce((sum, field) => sum + field.confidence, 0) / fields.length).toFixed(2));
  }

  private normalizeConfidence(value: unknown): number {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.max(0, Math.min(100, Number(numeric.toFixed(2))));
  }

  private normalizeFormType(value: unknown): 'attendance_sheet' | 'daily_report' | 'unknown' {
    return value === 'attendance_sheet' || value === 'daily_report' ? value : 'unknown';
  }

  private getImageMimeType(filePath: string): string {
    const ext = extname(filePath).toLowerCase();
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    if (ext === '.webp') return 'image/webp';
    return 'image/png';
  }

  private resolveUploadPath(storedPath: string): string {
    if (storedPath.startsWith('/')) return storedPath;
    return resolve(process.cwd(), storedPath);
  }
}
