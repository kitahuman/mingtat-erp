import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import OpenAI from 'openai';
import * as fs from 'fs';

// ══════════════════════════════════════════════════════════════
// OCR 結果介面
// ══════════════════════════════════════════════════════════════
export interface OcrResult {
  extractedData: Record<string, any>;
  fieldConfidence: Record<string, number>;
  overallConfidence: number;
  rawOcrText?: string;
  ocrEngine: string;
}

// ══════════════════════════════════════════════════════════════
// 支援的 OCR 來源類型
// ══════════════════════════════════════════════════════════════
type OcrSourceType = 'slip_chit' | 'slip_no_chit' | 'driver_sheet' | 'customer_record';

// ══════════════════════════════════════════════════════════════
// Prompt 策略介面
// ══════════════════════════════════════════════════════════════
interface OcrPromptStrategy {
  getSystemPrompt(): string;
  getUserPrompt(): string;
}

// ══════════════════════════════════════════════════════════════
// 策略實作：明達飛仔（有入帳票號）
// ══════════════════════════════════════════════════════════════
class SlipChitStrategy implements OcrPromptStrategy {
  getSystemPrompt(): string {
    return `你是一個專業的 OCR 辨識助手，專門辨識香港建築運輸公司的手寫飛仔（delivery slip）。
這是明達運輸/明達建築的飛仔，屬於堆填區運輸類，有入帳票號碼。
請仔細辨識圖片中的所有欄位，特別注意手寫中文和數字。`;
  }

  getUserPrompt(): string {
    return `請辨識這張明達飛仔（有入帳票號）的所有欄位，返回 JSON 格式。

需要辨識的欄位：
- slip_no: 飛仔編號（通常是紅色印刷的數字）
- company: 公司名稱
- date: 工作日期（格式：YYYY-MM-DD）
- cargo: 貨名（如泥石、建築廢料等）
- quantity: 數量（如 1車）
- vehicle_no: 車牌號碼
- chit_no_list: 入帳票號碼列表（可能有多個，返回陣列）
- location_from: 起點
- location_to: 終點
- contract: 合約編號
- remarks: 備註
- issuer: 發票人/簽發人

請返回以下 JSON 格式（不要加 markdown 代碼塊標記）：
{
  "extracted_data": {
    "slip_no": "",
    "company": "",
    "date": "",
    "cargo": "",
    "quantity": "",
    "vehicle_no": "",
    "chit_no_list": [],
    "location_from": "",
    "location_to": "",
    "contract": "",
    "remarks": "",
    "issuer": ""
  },
  "field_confidence": {
    "slip_no": 0,
    "company": 0,
    "date": 0,
    "cargo": 0,
    "quantity": 0,
    "vehicle_no": 0,
    "chit_no_list": 0,
    "location_from": 0,
    "location_to": 0,
    "contract": 0,
    "remarks": 0,
    "issuer": 0
  },
  "overall_confidence": 0
}

field_confidence 的值為 0-100 的整數，表示該欄位辨識的信心度。
overall_confidence 為整體信心度（0-100）。
如果某個欄位無法辨識或不存在，請將值設為空字串或空陣列，信心度設為 0。`;
  }
}

// ══════════════════════════════════════════════════════════════
// 策略實作：明達飛仔（無入帳票號）
// ══════════════════════════════════════════════════════════════
class SlipNoChitStrategy implements OcrPromptStrategy {
  getSystemPrompt(): string {
    return `你是一個專業的 OCR 辨識助手，專門辨識香港建築運輸公司的手寫飛仔（delivery slip）。
這是明達運輸/明達建築的飛仔，屬於機械/租車類，沒有入帳票號碼。
請仔細辨識圖片中的所有欄位，特別注意手寫中文和數字。`;
  }

  getUserPrompt(): string {
    return `請辨識這張明達飛仔（無入帳票號）的所有欄位，返回 JSON 格式。

需要辨識的欄位：
- slip_no: 飛仔編號（通常是紅色印刷的數字）
- company: 公司名稱
- date: 工作日期（格式：YYYY-MM-DD）
- cargo: 貨名
- quantity: 數量
- vehicle_no: 車牌號碼
- chit_no_list: 入帳票號碼列表（此類型通常為空，但如果有請辨識）
- location_from: 起點
- location_to: 終點
- contract: 合約編號
- remarks: 備註
- issuer: 發票人/簽發人

請返回以下 JSON 格式（不要加 markdown 代碼塊標記）：
{
  "extracted_data": {
    "slip_no": "",
    "company": "",
    "date": "",
    "cargo": "",
    "quantity": "",
    "vehicle_no": "",
    "chit_no_list": [],
    "location_from": "",
    "location_to": "",
    "contract": "",
    "remarks": "",
    "issuer": ""
  },
  "field_confidence": {
    "slip_no": 0,
    "company": 0,
    "date": 0,
    "cargo": 0,
    "quantity": 0,
    "vehicle_no": 0,
    "chit_no_list": 0,
    "location_from": 0,
    "location_to": 0,
    "contract": 0,
    "remarks": 0,
    "issuer": 0
  },
  "overall_confidence": 0
}

field_confidence 的值為 0-100 的整數，表示該欄位辨識的信心度。
overall_confidence 為整體信心度（0-100）。
如果某個欄位無法辨識或不存在，請將值設為空字串或空陣列，信心度設為 0。`;
  }
}

// ══════════════════════════════════════════════════════════════
// 策略實作：司機功課表
// ══════════════════════════════════════════════════════════════
class DriverSheetStrategy implements OcrPromptStrategy {
  getSystemPrompt(): string {
    return `你是一個專業的 OCR 辨識助手，專門辨識香港建築運輸公司的司機功課表（日報表）。
這是明達運輸/明達建築的司機功課表，記錄司機每日的工作項目。
功課表通常包含表頭（司機姓名、車牌、月份）和多行工作記錄。
請仔細辨識圖片中的所有欄位，特別注意手寫中文和數字。`;
  }

  getUserPrompt(): string {
    return `請辨識這張司機功課表的所有欄位，返回 JSON 格式。

表頭欄位：
- driver_name: 司機姓名
- vehicle_no: 車牌號碼
- month_period: 月份期間（如「上期」或「下期」）

每行工作記錄欄位：
- date: 工作日期（格式：YYYY-MM-DD）
- customer: 客戶/公司
- machine_type: 機種
- location_from: 起點
- location_to: 終點
- waybill_no: 運單號碼
- chit_no_list: 入帳票號碼列表（一行可能有多個，返回陣列）
- quantity: 轉數/數量
- remarks: 備註/合約號碼
- attendance: 出勤標記（N 或 --）

請返回以下 JSON 格式（不要加 markdown 代碼塊標記）：
{
  "extracted_data": {
    "driver_name": "",
    "vehicle_no": "",
    "month_period": "",
    "work_items": [
      {
        "date": "",
        "customer": "",
        "machine_type": "",
        "location_from": "",
        "location_to": "",
        "waybill_no": "",
        "chit_no_list": [],
        "quantity": "",
        "remarks": "",
        "attendance": ""
      }
    ]
  },
  "field_confidence": {
    "driver_name": 0,
    "vehicle_no": 0,
    "month_period": 0,
    "work_items": 0
  },
  "overall_confidence": 0
}

field_confidence 的值為 0-100 的整數，表示該欄位辨識的信心度。
work_items 的信心度代表整個工作項目列表的平均信心度。
overall_confidence 為整體信心度（0-100）。
如果某個欄位無法辨識或不存在，請將值設為空字串或空陣列，信心度設為 0。`;
  }
}

// ══════════════════════════════════════════════════════════════
// 策略實作：客戶月租機械紀錄
// ══════════════════════════════════════════════════════════════
class CustomerRecordStrategy implements OcrPromptStrategy {
  getSystemPrompt(): string {
    return `你是一個專業的 OCR 辨識助手，專門辨識香港建築公司的客戶月租機械紀錄。
這是明達建築的月租機械紀錄表，記錄每日上下班時間和機手簽署。
請仔細辨識圖片中的所有欄位，特別注意手寫中文和數字。`;
  }

  getUserPrompt(): string {
    return `請辨識這張客戶月租機械紀錄的所有欄位，返回 JSON 格式。

表頭欄位：
- doc_no: 機械 DOC 編號
- machine_type: 機械種類
- customer: 客戶公司
- work_area: 工作區域
- month: 月份

每日記錄欄位：
- date: 工作日期（格式：YYYY-MM-DD）
- time_in: 上班時間（格式：HH:mm）
- time_out: 下班時間（格式：HH:mm）
- lunch_break: 中晝休息
- operator_sign: 機手簽署（有/無，如果有請辨識姓名）
- client_sign: 客戶管工簽署（有/無，如果有請辨識姓名）

請返回以下 JSON 格式（不要加 markdown 代碼塊標記）：
{
  "extracted_data": {
    "doc_no": "",
    "machine_type": "",
    "customer": "",
    "work_area": "",
    "month": "",
    "daily_records": [
      {
        "date": "",
        "time_in": "",
        "time_out": "",
        "lunch_break": "",
        "operator_sign": "",
        "client_sign": ""
      }
    ]
  },
  "field_confidence": {
    "doc_no": 0,
    "machine_type": 0,
    "customer": 0,
    "work_area": 0,
    "month": 0,
    "daily_records": 0
  },
  "overall_confidence": 0
}

field_confidence 的值為 0-100 的整數，表示該欄位辨識的信心度。
daily_records 的信心度代表整個每日記錄列表的平均信心度。
overall_confidence 為整體信心度（0-100）。
如果某個欄位無法辨識或不存在，請將值設為空字串或空陣列，信心度設為 0。`;
  }
}

// ══════════════════════════════════════════════════════════════
// OCR 服務（策略模式）
// ══════════════════════════════════════════════════════════════
@Injectable()
export class OcrService {
  private openai: OpenAI;
  private strategies: Record<OcrSourceType, OcrPromptStrategy>;

  constructor(private readonly prisma: PrismaService) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error('[OcrService] OPENAI_API_KEY is not set!');
    } else {
      console.log('[OcrService] OPENAI_API_KEY loaded, prefix:', apiKey.substring(0, 7) + '...');
    }
    this.openai = new OpenAI({ apiKey });

    // 註冊策略
    this.strategies = {
      slip_chit: new SlipChitStrategy(),
      slip_no_chit: new SlipNoChitStrategy(),
      driver_sheet: new DriverSheetStrategy(),
      customer_record: new CustomerRecordStrategy(),
    };
  }

  // ══════════════════════════════════════════════════════════════
  // 處理單張圖片 OCR
  // ══════════════════════════════════════════════════════════════
  async processImage(imagePath: string, sourceType: OcrSourceType): Promise<OcrResult> {
    const strategy = this.strategies[sourceType];
    if (!strategy) {
      throw new BadRequestException(`不支援的 OCR 來源類型: ${sourceType}`);
    }

    // 處理 PDF：先轉為圖片（使用 pdf-to-img，純 Node.js 方案）
    const ext = imagePath.split('.').pop()?.toLowerCase() || 'jpeg';
    let actualImagePath = imagePath;
    if (ext === 'pdf') {
      const pdfOutputPath = imagePath.replace(/\.pdf$/i, '_pdf_page1.png');
      try {
        // @ts-ignore - pdf-to-img is ESM only, dynamic import works at runtime
        const { pdf } = await import('pdf-to-img');
        const document = await pdf(imagePath, { scale: 3 });
        const firstPage = await document.getPage(1);
        fs.writeFileSync(pdfOutputPath, firstPage);
        actualImagePath = pdfOutputPath;
      } catch (e: any) {
        throw new BadRequestException(`PDF 轉換失敗，請確認檔案是否正確: ${e.message}`);
      }
    }

    // 讀取圖片並轉為 base64
    const imageBuffer = fs.readFileSync(actualImagePath);
    const base64Image = imageBuffer.toString('base64');
    const mimeType = ext === 'pdf' ? 'image/png' : ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4.1-mini',
        messages: [
          {
            role: 'system',
            content: strategy.getSystemPrompt(),
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: strategy.getUserPrompt(),
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64Image}`,
                  detail: 'high',
                },
              },
            ],
          },
        ],
        max_tokens: 4096,
        temperature: 0.1,
      });

      const content = response.choices[0]?.message?.content || '';
      return this.parseOcrResponse(content);
    } catch (error: any) {
      console.error('[OcrService] GPT Vision API error:', error.message);
      throw new BadRequestException(`OCR 辨識失敗: ${error.message}`);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // 解析 GPT 回應為 OcrResult
  // ══════════════════════════════════════════════════════════════
  private parseOcrResponse(content: string): OcrResult {
    try {
      // 嘗試移除 markdown 代碼塊標記
      let jsonStr = content.trim();
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.slice(7);
      } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.slice(3);
      }
      if (jsonStr.endsWith('```')) {
        jsonStr = jsonStr.slice(0, -3);
      }
      jsonStr = jsonStr.trim();

      const parsed = JSON.parse(jsonStr);

      return {
        extractedData: parsed.extracted_data || {},
        fieldConfidence: parsed.field_confidence || {},
        overallConfidence: parsed.overall_confidence || 0,
        rawOcrText: content,
        ocrEngine: 'gpt-vision',
      };
    } catch {
      // 如果 JSON 解析失敗，返回原始文字
      console.warn('[OcrService] Failed to parse GPT response as JSON, returning raw text');
      return {
        extractedData: {},
        fieldConfidence: {},
        overallConfidence: 0,
        rawOcrText: content,
        ocrEngine: 'gpt-vision',
      };
    }
  }

  // ══════════════════════════════════════════════════════════════
  // 批量處理多張圖片
  // ══════════════════════════════════════════════════════════════
  async processMultipleImages(
    files: Express.Multer.File[],
    sourceType: OcrSourceType,
    options: {
      periodYear?: number;
      periodMonth?: number;
      userId?: number;
    },
  ) {
    // 查找來源
    const source = await this.prisma.verificationSource.findUnique({
      where: { source_code: sourceType },
    });
    if (!source) {
      throw new BadRequestException(`找不到來源: ${sourceType}`);
    }

    // 建立批次
    const today = new Date().toISOString().slice(0, 10);
    const existingCount = await this.prisma.verificationBatch.count({
      where: { batch_code: { startsWith: `BATCH-${today}-${sourceType}` } },
    });
    const batchCode = `BATCH-${today}-${sourceType}-${String(existingCount + 1).padStart(3, '0')}`;

    const batch = await this.prisma.verificationBatch.create({
      data: {
        batch_code: batchCode,
        batch_source_id: source.id,
        batch_file_name: files.map((f) => Buffer.from(f.originalname, 'latin1').toString('utf8')).join(', '),
        batch_upload_user_id: options.userId,
        batch_period_year: options.periodYear,
        batch_period_month: options.periodMonth,
        batch_total_rows: files.length,
        batch_filtered_rows: files.length,
        batch_status: 'processing',
        batch_processing_started_at: new Date(),
        batch_notes: `AI OCR 辨識 ${files.length} 張圖片`,
      },
    });

    // 逐張處理
    const ocrResults: any[] = [];
    let completedCount = 0;
    let failedCount = 0;

    for (const file of files) {
      const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      // 構建圖片 URL（相對路徑）
      const imageUrl = `/uploads/verification/${file.filename}`;

      try {
        const result = await this.processImage(file.path, sourceType);
        completedCount++;

        const ocrRecord = await this.prisma.verificationOcrResult.create({
          data: {
            ocr_batch_id: batch.id,
            ocr_source_id: source.id,
            ocr_file_name: originalName,
            ocr_image_url: imageUrl,
            ocr_extracted_data: result.extractedData,
            ocr_confidence_overall: result.overallConfidence,
            ocr_field_confidence: result.fieldConfidence,
            ocr_engine: result.ocrEngine,
            ocr_raw_text: result.rawOcrText,
            ocr_status: 'completed',
          },
        });

        ocrResults.push({
          ocr_id: ocrRecord.id,
          file_name: originalName,
          status: 'completed',
          confidence: result.overallConfidence,
          extracted_data: result.extractedData,
          field_confidence: result.fieldConfidence,
        });
      } catch (error: any) {
        failedCount++;
        const ocrRecord = await this.prisma.verificationOcrResult.create({
          data: {
            ocr_batch_id: batch.id,
            ocr_source_id: source.id,
            ocr_file_name: originalName,
            ocr_image_url: imageUrl,
            ocr_extracted_data: Prisma.DbNull,
            ocr_confidence_overall: 0,
            ocr_engine: 'gpt-vision',
            ocr_raw_text: error.message,
            ocr_status: 'failed',
          },
        });

        ocrResults.push({
          ocr_id: ocrRecord.id,
          file_name: originalName,
          status: 'failed',
          confidence: 0,
          error: error.message,
        });
      }
    }

    // 更新批次狀態
    const finalStatus = failedCount === files.length ? 'failed' : 'imported';
    await this.prisma.verificationBatch.update({
      where: { id: batch.id },
      data: {
        batch_status: finalStatus,
        batch_processing_completed_at: new Date(),
        batch_error_message: failedCount > 0 ? `${failedCount}/${files.length} 張圖片辨識失敗` : null,
      },
    });

    return {
      batch_id: batch.id,
      batch_code: batchCode,
      total_files: files.length,
      completed_count: completedCount,
      failed_count: failedCount,
      ocr_results: ocrResults,
    };
  }

  // ══════════════════════════════════════════════════════════════
  // 取得待確認的 OCR 結果列表
  // ══════════════════════════════════════════════════════════════
  async getPendingOcrResults(query: { page: number; limit: number; status?: string }) {
    const { page, limit, status } = query;

    const where: any = {};
    if (status && status !== 'all') {
      where.ocr_status = status;
    } else {
      // 預設顯示已完成但未確認的
      where.ocr_status = 'completed';
      where.ocr_user_confirmed = false;
    }

    const total = await this.prisma.verificationOcrResult.count({ where });
    const results = await this.prisma.verificationOcrResult.findMany({
      where,
      include: {
        batch: { select: { batch_code: true, batch_period_year: true, batch_period_month: true } },
        source: { select: { source_code: true, source_name: true } },
      },
      orderBy: { ocr_created_at: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: results,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  // ══════════════════════════════════════════════════════════════
  // 確認 OCR 結果（轉為 VerificationRecord 並觸發配對）
  // ══════════════════════════════════════════════════════════════
  async confirmOcrResult(
    ocrId: number,
    corrections?: Record<string, any>,
    userId?: number,
  ) {
    const ocrResult = await this.prisma.verificationOcrResult.findUnique({
      where: { id: ocrId },
      include: {
        batch: true,
        source: true,
      },
    });
    if (!ocrResult) {
      throw new BadRequestException('找不到 OCR 結果');
    }
    if (ocrResult.ocr_user_confirmed) {
      throw new BadRequestException('此 OCR 結果已確認');
    }

    // 合併修正
    const extractedData = (ocrResult.ocr_extracted_data as Record<string, any>) || {};
    const finalData = corrections ? { ...extractedData, ...corrections } : extractedData;

    // 更新 OCR 結果
    await this.prisma.verificationOcrResult.update({
      where: { id: ocrId },
      data: {
        ocr_user_confirmed: true,
        ocr_user_corrections: corrections || Prisma.DbNull,
        ocr_extracted_data: finalData,
      },
    });

    // 根據來源類型建立 VerificationRecord
    const sourceCode = ocrResult.source.source_code;
    const records = await this.createRecordsFromOcr(
      finalData,
      sourceCode,
      ocrResult.ocr_batch_id,
      ocrResult.source.id,
      ocrResult.ocr_confidence_overall ? Number(ocrResult.ocr_confidence_overall) : undefined,
    );

    return {
      ocr_id: ocrId,
      confirmed: true,
      records_created: records.length,
      records,
    };
  }

  // ══════════════════════════════════════════════════════════════
  // 從 OCR 結果建立 VerificationRecord
  // ══════════════════════════════════════════════════════════════
  private async createRecordsFromOcr(
    data: Record<string, any>,
    sourceCode: string,
    batchId: number,
    sourceId: number,
    confidence?: number,
  ) {
    const createdRecords: any[] = [];

    if (sourceCode === 'slip_chit' || sourceCode === 'slip_no_chit') {
      // 飛仔：一張飛仔 = 一筆 record
      const record = await this.prisma.verificationRecord.create({
        data: {
          record_batch_id: batchId,
          record_source_id: sourceId,
          record_source_row_number: 1,
          record_work_date: data.date ? new Date(data.date) : null,
          record_vehicle_no: data.vehicle_no || null,
          record_location_from: data.location_from || null,
          record_location_to: data.location_to || null,
          record_contract_no: data.contract || null,
          record_slip_no: data.slip_no || null,
          record_quantity: data.quantity || null,
          record_customer: data.company || null,
          record_raw_data: data,
          record_ocr_confidence: confidence,
        },
      });

      // 建立 chit 關聯
      const chitNos = data.chit_no_list || [];
      if (chitNos.length > 0) {
        await this.prisma.verificationRecordChit.createMany({
          data: chitNos.map((chitNo: string, idx: number) => ({
            chit_record_id: record.id,
            chit_no: String(chitNo),
            chit_seq: idx + 1,
          })),
        });
      }

      createdRecords.push({ id: record.id, type: 'slip', chit_count: chitNos.length });

    } else if (sourceCode === 'driver_sheet') {
      // 功課表：多行工作項目 = 多筆 record
      const workItems = data.work_items || [];
      let seq = 0;
      for (const item of workItems) {
        seq++;
        const record = await this.prisma.verificationRecord.create({
          data: {
            record_batch_id: batchId,
            record_source_id: sourceId,
            record_source_row_number: seq,
            record_work_date: item.date ? new Date(item.date) : null,
            record_vehicle_no: data.vehicle_no || null,
            record_driver_name: data.driver_name || null,
            record_customer: item.customer || null,
            record_location_from: item.location_from || null,
            record_location_to: item.location_to || null,
            record_slip_no: item.waybill_no || null,
            record_quantity: item.quantity || null,
            record_raw_data: { ...item, driver_name: data.driver_name, vehicle_no: data.vehicle_no },
            record_ocr_confidence: confidence,
          },
        });

        // 建立 chit 關聯
        const chitNos = item.chit_no_list || [];
        if (chitNos.length > 0) {
          await this.prisma.verificationRecordChit.createMany({
            data: chitNos.map((chitNo: string, idx: number) => ({
              chit_record_id: record.id,
              chit_no: String(chitNo),
              chit_seq: idx + 1,
            })),
          });
        }

        createdRecords.push({ id: record.id, type: 'driver_sheet_item', chit_count: chitNos.length });
      }

    } else if (sourceCode === 'customer_record') {
      // 客戶月租機械紀錄：多日記錄 = 多筆 record
      const dailyRecords = data.daily_records || [];
      let seq = 0;
      for (const item of dailyRecords) {
        seq++;
        const record = await this.prisma.verificationRecord.create({
          data: {
            record_batch_id: batchId,
            record_source_id: sourceId,
            record_source_row_number: seq,
            record_work_date: item.date ? new Date(item.date) : null,
            record_customer: data.customer || null,
            record_driver_name: item.operator_sign || null,
            record_location_from: data.work_area || null,
            record_time_in: item.time_in ? this.parseTimeToDate(item.time_in) : null,
            record_time_out: item.time_out ? this.parseTimeToDate(item.time_out) : null,
            record_raw_data: { ...item, doc_no: data.doc_no, machine_type: data.machine_type, customer: data.customer },
            record_ocr_confidence: confidence,
          },
        });

        createdRecords.push({ id: record.id, type: 'customer_record_item' });
      }
    }

    return createdRecords;
  }

  // ══════════════════════════════════════════════════════════════
  // 工具方法
  // ══════════════════════════════════════════════════════════════
  private parseTimeToDate(timeStr: string): Date | null {
    if (!timeStr) return null;
    const match = timeStr.match(/(\d{1,2}):(\d{2})/);
    if (!match) return null;
    const d = new Date('1970-01-01T00:00:00Z');
    d.setUTCHours(parseInt(match[1]), parseInt(match[2]), 0, 0);
    return d;
  }
}
