import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from './whatsapp.service';
import * as ExcelJS from 'exceljs';
import * as crypto from 'crypto';
import * as fs from 'fs';

interface UploadOptions {
  sourceType: string;
  periodYear?: number;
  periodMonth?: number;
  notes?: string;
  userId?: number;
  forceReimport?: boolean;
}

interface WorkbenchQuery {
  page: number;
  pageSize: number;
  filterStatus?: string;
  filterWorkType?: string;
  searchKeyword?: string;
  sortBy?: string;
  sortOrder?: string;
  dateFrom?: string;
  dateTo?: string;
}

interface MatchActionOptions {
  action: string;
  overrideData?: any;
  notes?: string;
  userId?: number;
  userName?: string;
}

interface SyncClockOptions {
  year: number;
  month: number;
  userId?: number;
}

@Injectable()
export class VerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappService: WhatsappService,
  ) {}

  // ══════════════════════════════════════════════════════════════
  // 來源列表
  // ══════════════════════════════════════════════════════════════
  async getSources() {
    return this.prisma.verificationSource.findMany({
      where: { source_is_active: true },
      orderBy: { id: 'asc' },
    });
  }

  // ══════════════════════════════════════════════════════════════
  // 上傳並解析檔案
  // ══════════════════════════════════════════════════════════════
  async uploadAndParseFile(file: Express.Multer.File, options: UploadOptions) {
    if (!file) {
      throw new BadRequestException('未上傳檔案');
    }

    // 查找來源
    const source = await this.prisma.verificationSource.findUnique({
      where: { source_code: options.sourceType },
    });
    if (!source) {
      throw new BadRequestException(`不支援的來源類型: ${options.sourceType}`);
    }

    // 計算檔案 hash
    const fileBuffer = fs.readFileSync(file.path);
    const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    // 檢查重複上傳
    if (!options.forceReimport) {
      const existingBatch = await this.prisma.verificationBatch.findFirst({
        where: { batch_file_hash: fileHash },
        include: { source: true },
      });
      if (existingBatch) {
        return {
          duplicate: true,
          existing_batch: {
            batch_code: existingBatch.batch_code,
            upload_time: existingBatch.batch_upload_time.toISOString().slice(0, 10),
            status: existingBatch.batch_status,
            total_rows: existingBatch.batch_total_rows,
          },
        };
      }
    }

    // 生成批次編號
    const today = new Date().toISOString().slice(0, 10);
    const existingCount = await this.prisma.verificationBatch.count({
      where: {
        batch_code: { startsWith: `BATCH-${today}-${options.sourceType}` },
      },
    });
    const batchCode = `BATCH-${today}-${options.sourceType}-${String(existingCount + 1).padStart(3, '0')}`;

    // 根據來源類型解析檔案
    let parseResult: { totalRows: number; matchedPlateRows: number; previewData: any[] };

    if (options.sourceType === 'receipt') {
      parseResult = await this.parseReceiptExcel(file.path);
    } else {
      throw new BadRequestException(`暫不支援 ${options.sourceType} 類型的檔案解析`);
    }

    // 建立批次記錄
    const batch = await this.prisma.verificationBatch.create({
      data: {
        batch_code: batchCode,
        batch_source_id: source.id,
        batch_file_name: Buffer.from(file.originalname, 'latin1').toString('utf8'),
        batch_file_size: BigInt(file.size),
        batch_file_hash: fileHash,
        batch_upload_user_id: options.userId,
        batch_period_year: options.periodYear,
        batch_period_month: options.periodMonth,
        batch_total_rows: parseResult.totalRows,
        batch_filtered_rows: parseResult.previewData.length,
        batch_status: 'imported',
        batch_notes: options.notes,
      },
    });

    // 將篩選後的資料暫存為 verification_record（status=pending）
    if (parseResult.previewData.length > 0) {
      await this.prisma.verificationRecord.createMany({
        data: parseResult.previewData.map((row, idx) => ({
          record_batch_id: batch.id,
          record_source_id: source.id,
          record_source_row_number: row._rowNumber || idx + 1,
          record_work_date: row.work_date ? new Date(row.work_date) : null,
          record_vehicle_no: row.vehicle_no || null,
          record_location_from: row.facility || null,
          record_location_to: null,
          record_contract_no: row.account_no || null,
          record_time_in: row.time_in ? this.parseTimeToDate(row.time_in) : null,
          record_time_out: row.time_out ? this.parseTimeToDate(row.time_out) : null,
          record_weight_net: row.net_weight != null ? row.net_weight : null,
          record_quantity: row.net_weight != null ? String(row.net_weight) : null,
          record_raw_data: row,
        })),
      });

      // 建立 chit 關聯
      const records = await this.prisma.verificationRecord.findMany({
        where: { record_batch_id: batch.id },
        orderBy: { record_source_row_number: 'asc' },
      });

      const chitData: { chit_record_id: number; chit_no: string; chit_seq: number }[] = [];
      for (let i = 0; i < records.length; i++) {
        const row = parseResult.previewData[i];
        if (row.chit_no) {
          chitData.push({
            chit_record_id: records[i].id,
            chit_no: String(row.chit_no),
            chit_seq: 1,
          });
        }
      }

      if (chitData.length > 0) {
        await this.prisma.verificationRecordChit.createMany({ data: chitData });
      }
    }

    return {
      batch_id: batch.id,
      batch_code: batch.batch_code,
      total_rows: parseResult.totalRows,
      imported_rows: parseResult.previewData.length,
      matched_plate_rows: parseResult.matchedPlateRows,
      preview_data: parseResult.previewData.slice(0, 50), // 只返回前 50 筆預覽
    };
  }

  // ══════════════════════════════════════════════════════════════
  // 解析入帳票 Excel
  // ══════════════════════════════════════════════════════════════
  private async parseReceiptExcel(filePath: string) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new BadRequestException('Excel 檔案中沒有工作表');
    }

    // 取得公司已登記的車牌
    const vehicles = await this.prisma.vehicle.findMany({
      where: { status: 'active' },
      select: { plate_number: true },
    });
    const companyPlates = new Set(
      vehicles.map((v) => v.plate_number.toUpperCase().replace(/\s+/g, '')),
    );

    // 解析 Excel 資料
    const allRows: any[] = [];
    const headerRow = worksheet.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell((cell, colNumber) => {
      headers[colNumber] = String(cell.value || '').trim();
    });

    // 找到各欄位的索引（header 可能含換行符，用 includes/startsWith 比對）
    const colMap: Record<string, number> = {};
    headers.forEach((h, idx) => {
      if (!h) return;
      // 取第一行做比對（去除換行後的中文部分）
      const firstLine = h.split(/[\r\n]/)[0].trim().toLowerCase();
      const lower = h.toLowerCase();
      if (firstLine.includes('facility') || lower.includes('facility')) colMap.facility = idx;
      else if ((firstLine.includes('date') && firstLine.includes('transaction')) || (lower.includes('date') && lower.includes('transaction'))) colMap.date = idx;
      else if (firstLine.includes('vehicle') || lower.includes('vehicle')) colMap.vehicle = idx;
      else if (firstLine.includes('account') || lower.includes('account')) colMap.account = idx;
      else if (firstLine.includes('chit') || lower.includes('chit')) colMap.chit = idx;
      else if (firstLine.startsWith('time-in') || firstLine.startsWith('time in') || lower.includes('time-in') || lower.includes('進入時間')) colMap.time_in = idx;
      else if (firstLine.startsWith('time-out') || firstLine.startsWith('time out') || lower.includes('time-out') || lower.includes('離開時間')) colMap.time_out = idx;
      else if (firstLine.includes('waste depth') || lower.includes('waste depth')) colMap.waste_depth = idx;
      else if (firstLine.includes('weight-in') || firstLine.includes('weight in') || lower.includes('weight-in') || lower.includes('入閘重量')) colMap.weight_in = idx;
      else if (firstLine.includes('weight-out') || firstLine.includes('weight out') || lower.includes('weight-out') || lower.includes('出閘重量')) colMap.weight_out = idx;
      else if (firstLine.includes('net weight') || firstLine.includes('net_weight') || lower.includes('net weight') || lower.includes('淨重量')) colMap.net_weight = idx;
    });

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // 跳過表頭

      const vehicleNo = colMap.vehicle ? this.getCellString(row.getCell(colMap.vehicle)) : '';
      if (!vehicleNo) return;

      const dateCell = colMap.date ? row.getCell(colMap.date) : null;
      const rawDate = dateCell?.value;
      let workDate: string | null = null;
      if (rawDate instanceof Date) {
        workDate = rawDate.toISOString().slice(0, 10);
      } else if (typeof rawDate === 'string') {
        workDate = this.parseDateString(rawDate);
      } else if (typeof rawDate === 'number') {
        // Excel serial date
        const d = new Date((rawDate - 25569) * 86400 * 1000);
        workDate = d.toISOString().slice(0, 10);
      }

      allRows.push({
        _rowNumber: rowNumber,
        facility: colMap.facility ? this.getCellString(row.getCell(colMap.facility)) : '',
        work_date: workDate,
        vehicle_no: vehicleNo,
        account_no: colMap.account ? this.getCellString(row.getCell(colMap.account)) : '',
        chit_no: colMap.chit ? this.getCellString(row.getCell(colMap.chit)) : '',
        time_in: colMap.time_in ? this.getCellString(row.getCell(colMap.time_in)) : '',
        time_out: colMap.time_out ? this.getCellString(row.getCell(colMap.time_out)) : '',
        waste_depth: colMap.waste_depth ? this.getCellNumber(row.getCell(colMap.waste_depth)) : null,
        weight_in: colMap.weight_in ? this.getCellNumber(row.getCell(colMap.weight_in)) : null,
        weight_out: colMap.weight_out ? this.getCellNumber(row.getCell(colMap.weight_out)) : null,
        net_weight: colMap.net_weight ? this.getCellNumber(row.getCell(colMap.net_weight)) : null,
      });
    });

    // 標記公司車牌匹配（僅作參考，不做篩選，全部匯入）
    let matchedPlateCount = 0;
    for (const row of allRows) {
      const plateNorm = (row.vehicle_no || '').toUpperCase().replace(/\s+/g, '');
      if (companyPlates.has(plateNorm)) {
        row._is_company_plate = true;
        matchedPlateCount++;
      } else {
        row._is_company_plate = false;
      }
    }

    return {
      totalRows: allRows.length,
      matchedPlateRows: matchedPlateCount,
      previewData: allRows, // 匯入全部記錄
    };
  }

  // ══════════════════════════════════════════════════════════════
  // 確認匯入並開始自動配對（增強版 — 多策略配對引擎）
  // ══════════════════════════════════════════════════════════════
  async confirmBatchAndMatch(batchId: number, userId?: number) {
    const batch = await this.prisma.verificationBatch.findUnique({
      where: { id: batchId },
      include: { source: true },
    });
    if (!batch) {
      throw new NotFoundException('找不到批次');
    }
    if (!['imported', 'pending', 'processing', 'failed'].includes(batch.batch_status)) {
      throw new BadRequestException(`批次狀態為 ${batch.batch_status}，無法配對`);
    }

    // 如果是 processing/failed 狀態（上次可能卡住或失敗），先清除舊的 match 記錄再重新配對
    if (batch.batch_status === 'processing' || batch.batch_status === 'failed') {
      const recordIds = await this.prisma.verificationRecord.findMany({
        where: { record_batch_id: batchId },
        select: { id: true },
      });
      if (recordIds.length > 0) {
        await this.prisma.verificationMatch.deleteMany({
          where: { match_record_id: { in: recordIds.map(r => r.id) } },
        });
      }
    }

    // 更新批次狀態
    await this.prisma.verificationBatch.update({
      where: { id: batchId },
      data: {
        batch_status: 'processing',
        batch_processing_started_at: new Date(),
      },
    });

    try {
      // 取得此批次的所有記錄及其 chit_no
      const records = await this.prisma.verificationRecord.findMany({
        where: { record_batch_id: batchId },
        include: { chits: true },
      });

      let matchedCount = 0;
      let diffCount = 0;
      let missingCount = 0;

      const sourceId = batch.batch_source_id;
      const sourceCode = batch.source.source_code;

      // 追蹤已配對的 record IDs 和 WorkLog IDs
      const matchedRecordIds = new Set<number>();

      for (const record of records) {
        const matchResult = await this.matchRecordToWorkLog(record, sourceId, sourceCode);
        if (matchResult) {
          matchedRecordIds.add(record.id);
          if (matchResult.status === 'matched') matchedCount++;
          else if (matchResult.status === 'diff') diffCount++;
        } else {
          // 來源有但系統沒有 → 建立 missing match（無 work_record_id）
          missingCount++;
          await this.prisma.verificationMatch.create({
            data: {
              match_work_record_id: 0, // placeholder — 無對應 WorkLog
              match_source_id: sourceId,
              match_record_id: record.id,
              match_status: 'missing',
              match_confidence: 0,
              match_method: 'none',
              match_diff_fields: { reason: '來源有記錄但系統找不到對應的工作紀錄' },
              match_diff_count: 0,
            },
          });
        }
      }

      // ── 雙向檢查：系統有但來源沒有 ──
      // 取得此批次期間的所有 WorkLog（未被配對的）
      if (batch.batch_period_year && batch.batch_period_month) {
        const periodStart = new Date(batch.batch_period_year, batch.batch_period_month - 1, 1);
        const periodEnd = new Date(batch.batch_period_year, batch.batch_period_month, 0);
        await this.checkMissingFromSource(sourceId, sourceCode, periodStart, periodEnd, batchId);
      }

      // 更新批次狀態
      await this.prisma.verificationBatch.update({
        where: { id: batchId },
        data: {
          batch_status: 'matched',
          batch_processing_completed_at: new Date(),
        },
      });

      return {
        batch_id: batchId,
        status: 'matched',
        matched_count: matchedCount,
        diff_count: diffCount,
        missing_count: missingCount,
        total_records: records.length,
      };
    } catch (error) {
      const errorMsg = error?.message || '配對過程發生未知錯誤';
      const errorDetail = error?.stack ? `${errorMsg}\n\nStack: ${error.stack}` : errorMsg;
      await this.prisma.verificationBatch.update({
        where: { id: batchId },
        data: {
          batch_status: 'failed',
          batch_error_message: errorDetail,
          batch_processing_completed_at: new Date(),
        },
      });
      // 不再 throw — 返回 failed 狀態讓前端顯示錯誤原因
      return {
        batch_id: batchId,
        status: 'failed',
        error: errorMsg,
        matched_count: 0,
        diff_count: 0,
        missing_count: 0,
        total_records: 0,
      };
    }
  }

  // ══════════════════════════════════════════════════════════════
  // 多策略配對引擎
  // ══════════════════════════════════════════════════════════════
  private async matchRecordToWorkLog(
    record: any,
    sourceId: number,
    sourceCode: string,
  ): Promise<{ status: string; workLogId: number } | null> {
    const chitNos = (record.chits || []).map((c: any) => c.chit_no);

    // ── 策略 A: chit_no 精確匹配（最高優先，信心度 95-100%）──
    if (chitNos.length > 0) {
      for (const chitNo of chitNos) {
        const workLogs = await this.prisma.workLog.findMany({
          where: { receipt_no: chitNo },
          include: { employee: true },
        });
        if (workLogs.length > 0) {
          for (const wl of workLogs) {
            const result = await this.createMatchWithComparison(record, wl, sourceId, sourceCode, 'chit_no', 95);
            return { status: result.status, workLogId: wl.id };
          }
        }
      }
    }

    // ── 策略 B: slip_no 精確匹配（信心度 90%）──
    if (record.record_slip_no) {
      const workLogs = await this.prisma.workLog.findMany({
        where: { work_order_no: record.record_slip_no },
        include: { employee: true },
      });
      if (workLogs.length > 0) {
        for (const wl of workLogs) {
          const result = await this.createMatchWithComparison(record, wl, sourceId, sourceCode, 'slip_no', 90);
          return { status: result.status, workLogId: wl.id };
        }
      }
    }

    // ── 策略 C: date + vehicle_no 匹配（信心度 70-80%）──
    if (record.record_work_date && record.record_vehicle_no) {
      const dateStr = record.record_work_date.toISOString().slice(0, 10);
      const vehicleNorm = (record.record_vehicle_no || '').toUpperCase().replace(/\s+/g, '');

      const workLogs = await this.prisma.workLog.findMany({
        where: {
          scheduled_date: new Date(dateStr),
        },
        include: { employee: true },
      });

      const matched = workLogs.filter((wl) => {
        const wlPlate = (wl.equipment_number || '').toUpperCase().replace(/\s+/g, '');
        return wlPlate === vehicleNorm || this.fuzzyPlateMatch(vehicleNorm, wlPlate);
      });

      if (matched.length > 0) {
        // 如果有多個匹配，取第一個（可能需要更精確的邏輯）
        const wl = matched[0];
        const confidence = matched.length === 1 ? 80 : 70;
        const result = await this.createMatchWithComparison(record, wl, sourceId, sourceCode, 'date_vehicle', confidence);
        return { status: result.status, workLogId: wl.id };
      }
    }

    // ── 策略 D: date + employee 匹配（信心度 60-70%，用於打卡記錄）──
    if (record.record_work_date && record.record_employee_id) {
      const dateStr = record.record_work_date.toISOString().slice(0, 10);

      const workLogs = await this.prisma.workLog.findMany({
        where: {
          scheduled_date: new Date(dateStr),
          employee_id: record.record_employee_id,
        },
        include: { employee: true },
      });

      if (workLogs.length > 0) {
        const wl = workLogs[0];
        const confidence = workLogs.length === 1 ? 70 : 60;
        const result = await this.createMatchWithComparison(record, wl, sourceId, sourceCode, 'date_employee', confidence);
        return { status: result.status, workLogId: wl.id };
      }
    }

    // ── 策略 D-alt: date + employee_name 匹配（用於沒有 employee_id 的情況）──
    if (record.record_work_date && record.record_employee_name && !record.record_employee_id) {
      const dateStr = record.record_work_date.toISOString().slice(0, 10);
      const empName = record.record_employee_name;

      // 查找員工（by nickname or name_zh）
      const employees = await this.prisma.employee.findMany({
        where: {
          OR: [
            { nickname: { equals: empName, mode: 'insensitive' } },
            { name_zh: { equals: empName, mode: 'insensitive' } },
          ],
        },
        select: { id: true },
      });

      if (employees.length > 0) {
        const empIds = employees.map((e) => e.id);
        const workLogs = await this.prisma.workLog.findMany({
          where: {
            scheduled_date: new Date(dateStr),
            employee_id: { in: empIds },
          },
          include: { employee: true },
        });

        if (workLogs.length > 0) {
          const wl = workLogs[0];
          const confidence = workLogs.length === 1 ? 65 : 60;
          const result = await this.createMatchWithComparison(record, wl, sourceId, sourceCode, 'date_employee', confidence);
          return { status: result.status, workLogId: wl.id };
        }
      }
    }

    return null; // 無法配對
  }

  // ══════════════════════════════════════════════════════════════
  // 建立配對記錄並比較差異（增強版 — 包含車牌和地點比較）
  // ══════════════════════════════════════════════════════════════
  private async createMatchWithComparison(
    record: any,
    workLog: any,
    sourceId: number,
    sourceCode: string,
    matchMethod: string,
    baseConfidence: number,
  ): Promise<{ status: string }> {
    const diffFields: Record<string, any> = {};
    let diffFieldCount = 0;

    // 比較日期
    if (record.record_work_date && workLog.scheduled_date) {
      const recDate = record.record_work_date.toISOString().slice(0, 10);
      const wlDate = workLog.scheduled_date.toISOString().slice(0, 10);
      if (recDate !== wlDate) {
        diffFields['date'] = { sys: wlDate, src: recDate, diff: '日期不同' };
        diffFieldCount++;
      }
    }

    // 比較時間
    if (record.record_time_in) {
      const recTimeIn = this.formatTime(record.record_time_in);
      const wlTimeIn = workLog.start_time || '';
      if (recTimeIn && wlTimeIn && recTimeIn !== wlTimeIn) {
        diffFields['time_in'] = { sys: wlTimeIn, src: recTimeIn, diff: '進入時間不同' };
        diffFieldCount++;
      }
    }

    if (record.record_time_out) {
      const recTimeOut = this.formatTime(record.record_time_out);
      const wlTimeOut = workLog.end_time || '';
      if (recTimeOut && wlTimeOut && recTimeOut !== wlTimeOut) {
        diffFields['time_out'] = { sys: wlTimeOut, src: recTimeOut, diff: '離開時間不同' };
        diffFieldCount++;
      }
    }

    // 比較重量
    if (record.record_weight_net != null && workLog.quantity != null) {
      const recWeight = Number(record.record_weight_net);
      const wlQty = Number(workLog.quantity);
      if (Math.abs(recWeight - wlQty) > 0.5) {
        diffFields['weight'] = {
          sys: String(wlQty),
          src: String(recWeight),
          diff: `${recWeight > wlQty ? '+' : ''}${(recWeight - wlQty).toFixed(2)}噸`,
        };
        diffFieldCount++;
      }
    }

    // ── 新增：比較車牌（支援 * 萬用字符模糊匹配）──
    if (record.record_vehicle_no && workLog.equipment_number) {
      const recPlate = (record.record_vehicle_no || '').toUpperCase().replace(/\s+/g, '');
      const wlPlate = (workLog.equipment_number || '').toUpperCase().replace(/\s+/g, '');
      if (recPlate !== wlPlate && !this.fuzzyPlateMatch(recPlate, wlPlate)) {
        diffFields['vehicle'] = {
          sys: workLog.equipment_number,
          src: record.record_vehicle_no,
          diff: '車牌不同',
        };
        diffFieldCount++;
      }
    }

    // ── 新增：比較地點（模糊比較）──
    if (record.record_location_from) {
      const recLoc = (record.record_location_from || '').trim();
      const wlStartLoc = (workLog.start_location || '').trim();
      const wlEndLoc = (workLog.end_location || '').trim();

      if (recLoc && wlStartLoc) {
        if (!this.fuzzyLocationMatch(recLoc, wlStartLoc) && !this.fuzzyLocationMatch(recLoc, wlEndLoc)) {
          diffFields['location'] = {
            sys: `${wlStartLoc} → ${wlEndLoc}`,
            src: recLoc,
            diff: '地點不同',
          };
          diffFieldCount++;
        }
      }
    }

    if (record.record_location_to) {
      const recLocTo = (record.record_location_to || '').trim();
      const wlEndLoc = (workLog.end_location || '').trim();

      if (recLocTo && wlEndLoc) {
        if (!this.fuzzyLocationMatch(recLocTo, wlEndLoc)) {
          if (!diffFields['location']) {
            diffFields['location_to'] = {
              sys: wlEndLoc,
              src: recLocTo,
              diff: '終點地點不同',
            };
            diffFieldCount++;
          }
        }
      }
    }

    const matchStatus = diffFieldCount > 0 ? 'diff' : 'matched';
    const finalConfidence = diffFieldCount === 0
      ? baseConfidence
      : Math.max(30, baseConfidence - diffFieldCount * 10);

    // 建立配對記錄
    await this.prisma.verificationMatch.create({
      data: {
        match_work_record_id: workLog.id,
        match_source_id: sourceId,
        match_record_id: record.id,
        match_status: matchStatus,
        match_confidence: finalConfidence,
        match_method: matchMethod,
        match_diff_fields: diffFieldCount > 0 ? diffFields : undefined,
        match_diff_count: diffFieldCount,
      },
    });

    return { status: matchStatus };
  }

  // ══════════════════════════════════════════════════════════════
  // 車牌模糊匹配（支援 * 萬用字符）
  // ══════════════════════════════════════════════════════════════
  private fuzzyPlateMatch(plate1: string, plate2: string): boolean {
    if (!plate1 || !plate2) return false;
    const p1 = plate1.toUpperCase().replace(/\s+/g, '');
    const p2 = plate2.toUpperCase().replace(/\s+/g, '');
    if (p1 === p2) return true;
    // Check if either plate contains * wildcard
    if (p1.includes('*') || p2.includes('*')) {
      const pattern = p1.includes('*') ? p1 : p2;
      const target = p1.includes('*') ? p2 : p1;
      // Convert * pattern to regex: each * matches exactly one character
      const regexStr = '^' + pattern.replace(/\*/g, '.') + '$';
      try {
        return new RegExp(regexStr, 'i').test(target);
      } catch {
        return false;
      }
    }
    return false;
  }

  // ══════════════════════════════════════════════════════════════
  // 模糊地點比較
  // ══════════════════════════════════════════════════════════════
  private fuzzyLocationMatch(loc1: string, loc2: string): boolean {
    if (!loc1 || !loc2) return false;

    const normalize = (s: string) =>
      s.toLowerCase()
        .replace(/\s+/g, '')
        .replace(/[（）()]/g, '')
        .replace(/堆填區/g, '堆填')
        .replace(/landfill/gi, '堆填')
        .replace(/[,，、。.]/g, '');

    const n1 = normalize(loc1);
    const n2 = normalize(loc2);

    // 完全匹配
    if (n1 === n2) return true;

    // 包含匹配
    if (n1.includes(n2) || n2.includes(n1)) return true;

    // 簡單相似度（共同字符比例）
    const chars1 = new Set(n1.split(''));
    const chars2 = new Set(n2.split(''));
    let common = 0;
    for (const c of chars1) {
      if (chars2.has(c)) common++;
    }
    const similarity = (common * 2) / (chars1.size + chars2.size);
    return similarity > 0.6;
  }

  // ══════════════════════════════════════════════════════════════
  // 雙向檢查：系統有但來源沒有
  // ══════════════════════════════════════════════════════════════
  private async checkMissingFromSource(
    sourceId: number,
    sourceCode: string,
    periodStart: Date,
    periodEnd: Date,
    batchId: number,
  ) {
    // 取得期間內所有 WorkLog
    const workLogs = await this.prisma.workLog.findMany({
      where: {
        scheduled_date: {
          gte: periodStart,
          lte: periodEnd,
        },
      },
      select: { id: true },
    });

    if (workLogs.length === 0) return;

    const workLogIds = workLogs.map((wl) => wl.id);

    // 取得已有配對的 WorkLog IDs（此來源）
    const existingMatches = await this.prisma.verificationMatch.findMany({
      where: {
        match_source_id: sourceId,
        match_work_record_id: { in: workLogIds },
      },
      select: { match_work_record_id: true },
    });

    const matchedWlIds = new Set(existingMatches.map((m) => m.match_work_record_id));

    // 找出未被配對的 WorkLog（系統有但來源沒有）
    const unmatchedWlIds = workLogIds.filter((id) => !matchedWlIds.has(id));

    if (unmatchedWlIds.length === 0) return;

    // 根據來源類型決定是否需要建立 missing 記錄
    // 對於 receipt 來源，只檢查有 receipt_no 的 WorkLog
    let relevantUnmatchedIds = unmatchedWlIds;
    if (sourceCode === 'receipt') {
      const wlsWithReceipt = await this.prisma.workLog.findMany({
        where: {
          id: { in: unmatchedWlIds },
          receipt_no: { not: null },
        },
        select: { id: true },
      });
      relevantUnmatchedIds = wlsWithReceipt.map((wl) => wl.id);
    }

    // 批量建立 missing 記錄（來源缺失）
    if (relevantUnmatchedIds.length > 0) {
      await this.prisma.verificationMatch.createMany({
        data: relevantUnmatchedIds.map((wlId) => ({
          match_work_record_id: wlId,
          match_source_id: sourceId,
          match_record_id: null,
          match_status: 'source_missing',
          match_confidence: 0,
          match_method: 'bidirectional_check',
          match_diff_fields: { reason: '系統有工作紀錄但來源沒有對應記錄' },
          match_diff_count: 0,
        })),
      });
    }
  }

  // ══════════════════════════════════════════════════════════════
  // 打卡記錄自動同步
  // ══════════════════════════════════════════════════════════════
  async syncClockRecords(options: SyncClockOptions) {
    const { year, month, userId } = options;

    // 查找 clock 來源
    const clockSource = await this.prisma.verificationSource.findUnique({
      where: { source_code: 'clock' },
    });
    if (!clockSource) {
      throw new BadRequestException('找不到打卡紀錄來源設定');
    }

    // 計算月份範圍
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    // 查詢指定月份的 EmployeeAttendance 記錄
    const attendances = await this.prisma.employeeAttendance.findMany({
      where: {
        timestamp: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        employee: {
          select: { id: true, name_zh: true, nickname: true },
        },
      },
      orderBy: { timestamp: 'asc' },
    });

    if (attendances.length === 0) {
      return {
        batch_id: null,
        status: 'empty',
        message: `${year}年${month}月沒有打卡記錄`,
        synced_count: 0,
        matched_count: 0,
        diff_count: 0,
        missing_count: 0,
      };
    }

    // 按 employee_id + date 分組
    const groupMap = new Map<string, any[]>();
    for (const att of attendances) {
      const dateKey = att.timestamp.toISOString().slice(0, 10);
      const key = `${att.employee_id}_${dateKey}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, []);
      }
      groupMap.get(key)!.push(att);
    }

    // 生成批次編號
    const today = new Date().toISOString().slice(0, 10);
    const existingCount = await this.prisma.verificationBatch.count({
      where: {
        batch_code: { startsWith: `BATCH-${today}-clock` },
      },
    });
    const batchCode = `BATCH-${today}-clock-${String(existingCount + 1).padStart(3, '0')}`;

    // 建立批次記錄
    const batch = await this.prisma.verificationBatch.create({
      data: {
        batch_code: batchCode,
        batch_source_id: clockSource.id,
        batch_file_name: `sync-${year}-${String(month).padStart(2, '0')}`,
        batch_upload_user_id: userId,
        batch_period_year: year,
        batch_period_month: month,
        batch_total_rows: attendances.length,
        batch_filtered_rows: groupMap.size,
        batch_status: 'processing',
        batch_processing_started_at: new Date(),
        batch_notes: `自動同步 ${year}年${month}月打卡記錄`,
      },
    });

    try {
      // 建立 VerificationRecord（每筆 = 一個員工一天的打卡記錄）
      const recordDataList: any[] = [];
      let seq = 0;
      for (const [key, atts] of groupMap) {
        seq++;
        const [empIdStr, dateStr] = key.split('_');
        const empId = parseInt(empIdStr);
        const emp = atts[0].employee;

        // 找最早的 clock_in 和最晚的 clock_out
        const clockIns = atts.filter((a: any) => a.type === 'clock_in').sort((a: any, b: any) => a.timestamp.getTime() - b.timestamp.getTime());
        const clockOuts = atts.filter((a: any) => a.type === 'clock_out').sort((a: any, b: any) => b.timestamp.getTime() - a.timestamp.getTime());

        const earliestIn = clockIns.length > 0 ? clockIns[0] : null;
        const latestOut = clockOuts.length > 0 ? clockOuts[0] : null;

        recordDataList.push({
          record_batch_id: batch.id,
          record_source_id: clockSource.id,
          record_source_row_number: seq,
          record_work_date: new Date(dateStr),
          record_employee_id: empId,
          record_employee_name: emp?.nickname || emp?.name_zh || `員工#${empId}`,
          record_time_in: earliestIn ? this.extractTimeFromTimestamp(earliestIn.timestamp) : null,
          record_time_out: latestOut ? this.extractTimeFromTimestamp(latestOut.timestamp) : null,
          record_location_from: earliestIn?.address || null,
          record_location_to: latestOut?.address || null,
          record_raw_data: {
            employee_id: empId,
            date: dateStr,
            clock_in_count: clockIns.length,
            clock_out_count: clockOuts.length,
            records: atts.map((a: any) => ({
              type: a.type,
              timestamp: a.timestamp.toISOString(),
              address: a.address,
              latitude: a.latitude,
              longitude: a.longitude,
            })),
          },
        });
      }

      await this.prisma.verificationRecord.createMany({ data: recordDataList });

      // 取得剛建立的記錄
      const records = await this.prisma.verificationRecord.findMany({
        where: { record_batch_id: batch.id },
        include: { chits: true },
      });

      // 自動配對：用 date + employee_id 配對 WorkLog
      let matchedCount = 0;
      let diffCount = 0;
      let missingCount = 0;

      for (const record of records) {
        const matchResult = await this.matchRecordToWorkLog(record, clockSource.id, 'clock');
        if (matchResult) {
          if (matchResult.status === 'matched') matchedCount++;
          else if (matchResult.status === 'diff') diffCount++;
        } else {
          missingCount++;
          await this.prisma.verificationMatch.create({
            data: {
              match_work_record_id: 0,
              match_source_id: clockSource.id,
              match_record_id: record.id,
              match_status: 'missing',
              match_confidence: 0,
              match_method: 'none',
              match_diff_fields: { reason: '打卡記錄找不到對應的工作紀錄' },
              match_diff_count: 0,
            },
          });
        }
      }

      // 雙向檢查
      await this.checkMissingFromSource(clockSource.id, 'clock', startDate, endDate, batch.id);

      // 更新批次狀態
      await this.prisma.verificationBatch.update({
        where: { id: batch.id },
        data: {
          batch_status: 'matched',
          batch_processing_completed_at: new Date(),
        },
      });

      return {
        batch_id: batch.id,
        batch_code: batchCode,
        status: 'matched',
        synced_count: groupMap.size,
        matched_count: matchedCount,
        diff_count: diffCount,
        missing_count: missingCount,
        total_attendance_records: attendances.length,
      };
    } catch (error) {
      await this.prisma.verificationBatch.update({
        where: { id: batch.id },
        data: {
          batch_status: 'failed',
          batch_error_message: error.message || '同步過程發生錯誤',
          batch_processing_completed_at: new Date(),
        },
      });
      throw error;
    }
  }
  // ══════════════════════════════════════════════════════════════
  // 核對工作台（統一使用 matching + confirmation 邏輯）
  // ══════════════════════════════════════════════════════════════
  async getWorkbench(query: WorkbenchQuery) {
    const { page, pageSize, filterStatus, filterWorkType, searchKeyword, sortBy, sortOrder, dateFrom, dateTo } = query;

    // 構建 WorkLog 查詢條件
    const where: any = {};

    if (dateFrom || dateTo) {
      where.scheduled_date = {};
      if (dateFrom) where.scheduled_date.gte = new Date(dateFrom);
      if (dateTo) where.scheduled_date.lte = new Date(dateTo);
    }

    if (filterWorkType) {
      where.service_type = filterWorkType;
    }

    if (searchKeyword) {
      where.OR = [
        { receipt_no: { contains: searchKeyword, mode: 'insensitive' } },
        { work_order_no: { contains: searchKeyword, mode: 'insensitive' } },
        { start_location: { contains: searchKeyword, mode: 'insensitive' } },
        { end_location: { contains: searchKeyword, mode: 'insensitive' } },
        { employee: { nickname: { contains: searchKeyword, mode: 'insensitive' } } },
      ];
    }

    // 查詢工作紀錄
    const orderByClause: any = {};
    if (sortBy === 'date') orderByClause.scheduled_date = sortOrder === 'asc' ? 'asc' : 'desc';
    else if (sortBy === 'vehicle') orderByClause.equipment_number = sortOrder === 'asc' ? 'asc' : 'desc';
    else orderByClause.scheduled_date = 'desc';

    const total = await this.prisma.workLog.count({ where });
    const workLogs = await this.prisma.workLog.findMany({
      where,
      include: {
        employee: { select: { id: true, name_zh: true, nickname: true } },
        client: { select: { id: true, name: true } },
        contract: { select: { id: true, contract_no: true } },
        company_profile: { select: { id: true, chinese_name: true } },
      },
      orderBy: orderByClause,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    if (workLogs.length === 0) {
      return {
        summary: { total_records: total, matched_count: 0, diff_count: 0, missing_count: 0, unverified_count: 0 },
        records: [],
        pagination: { page, page_size: pageSize, total_pages: Math.ceil(total / pageSize), total },
      };
    }

    // ── 批量取得所有來源資料 ──────────────────────────────────
    // 計算日期範圍
    const dates = workLogs
      .map((wl) => wl.scheduled_date)
      .filter((d): d is Date => d != null);
    if (dates.length === 0) {
      return {
        summary: { total_records: total, matched_count: 0, diff_count: 0, missing_count: 0, unverified_count: 0 },
        records: workLogs.map((wl) => this.buildEmptyRecord(wl)),
        pagination: { page, page_size: pageSize, total_pages: Math.ceil(total / pageSize), total },
      };
    }
    const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));
    minDate.setHours(0, 0, 0, 0);
    maxDate.setHours(23, 59, 59, 999);

    // 入帳票
    const receiptSource = await this.prisma.verificationSource.findUnique({ where: { source_code: 'receipt' } });
    const receiptRecords = receiptSource
      ? await this.prisma.verificationRecord.findMany({
          where: { record_source_id: receiptSource.id, record_work_date: { gte: minDate, lte: maxDate } },
          include: { chits: true },
        })
      : [];

    // 飛仔 OCR
    const slipSources = await this.prisma.verificationSource.findMany({
      where: { source_code: { in: ['slip_chit', 'slip_no_chit'] } },
    });
    const slipSourceIds = slipSources.map((s) => s.id);
    const slipRecords = slipSourceIds.length > 0
      ? await this.prisma.verificationRecord.findMany({
          where: { record_source_id: { in: slipSourceIds }, record_work_date: { gte: minDate, lte: maxDate } },
          include: { chits: true },
        })
      : [];

    // GPS
    const gpsSummaries = await this.prisma.verificationGpsSummary.findMany({
      where: { gps_summary_date: { gte: minDate, lte: maxDate } },
    });

    // 打卡
    const attendances = await this.prisma.employeeAttendance.findMany({
      where: { timestamp: { gte: minDate, lt: new Date(maxDate.getTime() + 86400000) } },
      include: { employee: { select: { id: true, name_zh: true, nickname: true } } },
    });

    // WhatsApp
    const waOrderItems = await this.whatsappService.getDailySummaryItemsForMatching(minDate, maxDate);

    // 手動配對記錄
    const workLogIds = workLogs.map((wl) => wl.id);
    const confirmations = await this.prisma.verificationConfirmation.findMany({
      where: { work_log_id: { in: workLogIds } },
    });
    const confirmMap = new Map<number, Map<string, any>>();
    for (const c of confirmations) {
      if (!confirmMap.has(c.work_log_id)) confirmMap.set(c.work_log_id, new Map());
      confirmMap.get(c.work_log_id)!.set(c.source_code, c);
    }

    // 手動配對的 WA item IDs（需要額外查詢）
    const manualWaItemIds = confirmations
      .filter((c) => c.source_code === 'whatsapp_order' && c.status === 'manual_match' && c.matched_record_id)
      .map((c) => c.matched_record_id!);
    const manualWaItems = manualWaItemIds.length > 0
      ? await this.prisma.verificationWaOrderItem.findMany({ where: { id: { in: manualWaItemIds } } })
      : [];
    const manualWaItemMap = new Map(manualWaItems.map((item) => [item.id, item]));

    // ── 車牌正規化工具 ──────────────────────────────────────
    const normalizeVehicle = (plate: string | null | undefined): string => {
      if (!plate) return '';
      return plate.toUpperCase().replace(/[\s\-]/g, '');
    };

    // ── 按日期+車牌索引來源資料 ─────────────────────────────
    // 入帳票索引
    const receiptIndex = new Map<string, any[]>();
    for (const r of receiptRecords) {
      const dateKey = r.record_work_date?.toISOString().slice(0, 10) || '';
      const vKey = normalizeVehicle(r.record_vehicle_no);
      const key = `${dateKey}|${vKey}`;
      if (!receiptIndex.has(key)) receiptIndex.set(key, []);
      receiptIndex.get(key)!.push(r);
    }

    // 飛仔索引
    const slipIndex = new Map<string, any[]>();
    for (const r of slipRecords) {
      const dateKey = r.record_work_date?.toISOString().slice(0, 10) || '';
      const vKey = normalizeVehicle(r.record_vehicle_no);
      const key = `${dateKey}|${vKey}`;
      if (!slipIndex.has(key)) slipIndex.set(key, []);
      slipIndex.get(key)!.push(r);
    }

    // GPS 索引
    const gpsIndex = new Map<string, any[]>();
    for (const g of gpsSummaries) {
      const dateKey = (g as any).gps_summary_date?.toISOString().slice(0, 10) || '';
      const vKey = normalizeVehicle((g as any).gps_summary_vehicle_no);
      const key = `${dateKey}|${vKey}`;
      if (!gpsIndex.has(key)) gpsIndex.set(key, []);
      gpsIndex.get(key)!.push(g);
    }

    // 打卡索引（按日期+員工ID）
    const attendanceIndex = new Map<string, any[]>();
    for (const a of attendances) {
      const dateKey = a.timestamp?.toISOString().slice(0, 10) || '';
      const key = `${dateKey}|${a.employee_id}`;
      if (!attendanceIndex.has(key)) attendanceIndex.set(key, []);
      attendanceIndex.get(key)!.push(a);
    }

    // WhatsApp 索引（按日期+車牌）
    const waIndex = new Map<string, any[]>();
    for (const item of waOrderItems) {
      const dateKey = (item as any).order_date || '';
      const vKey1 = normalizeVehicle((item as any).wa_item_vehicle_no);
      const vKey2 = normalizeVehicle((item as any).wa_item_machine_code);
      if (vKey1) {
        const key = `${dateKey}|${vKey1}`;
        if (!waIndex.has(key)) waIndex.set(key, []);
        waIndex.get(key)!.push(item);
      }
      if (vKey2 && vKey2 !== vKey1) {
        const key = `${dateKey}|${vKey2}`;
        if (!waIndex.has(key)) waIndex.set(key, []);
        waIndex.get(key)!.push(item);
      }
    }

    // ── 逐筆工作紀錄計算各來源狀態 ─────────────────────────
    // 來源 key 對應: receipt, slip_chit(→slip), driver_sheet(→sheet), customer_record(→customer), gps, clock, whatsapp_order(→whatsapp)
    const records = workLogs.map((wl) => {
      const date = wl.scheduled_date?.toISOString().slice(0, 10) || '';
      const vehicleNorm = normalizeVehicle(wl.equipment_number);
      const employeeId = wl.employee_id;
      const lookupKey = `${date}|${vehicleNorm}`;
      const wlConfirms = confirmMap.get(wl.id);

      // 判斷單個來源的狀態
      const getSourceStatus = (sourceCode: string, hasAutoMatch: boolean): string => {
        const confirm = wlConfirms?.get(sourceCode);
        if (confirm) {
          if (confirm.status === 'manual_match' || confirm.status === 'confirmed') return 'matched';
          if (confirm.status === 'skipped') return 'na';
        }
        return hasAutoMatch ? 'matched' : 'missing';
      };

      // 入帳票
      const hasReceipt = vehicleNorm ? (receiptIndex.get(lookupKey)?.length || 0) > 0 : false;
      const statusReceipt = date ? getSourceStatus('receipt', hasReceipt) : 'unverified';

      // 飛仔
      const hasSlip = vehicleNorm ? (slipIndex.get(lookupKey)?.length || 0) > 0 : false;
      const statusSlip = date ? getSourceStatus('slip_chit', hasSlip) : 'unverified';

      // 功課表（暫無自動配對資料源；只有手動確認時才顯示狀態，否則 na）
      const sheetConfirm = wlConfirms?.get('driver_sheet');
      const statusSheet = sheetConfirm ? getSourceStatus('driver_sheet', false) : 'na';

      // 客戶記錄（暫無自動配對資料源；只有手動確認時才顯示狀態，否則 na）
      const customerConfirm = wlConfirms?.get('customer_record');
      const statusCustomer = customerConfirm ? getSourceStatus('customer_record', false) : 'na';

      // GPS
      const hasGps = vehicleNorm ? (gpsIndex.get(lookupKey)?.length || 0) > 0 : false;
      const statusGps = date ? getSourceStatus('gps', hasGps) : 'unverified';

      // 打卡
      const clockKey = `${date}|${employeeId}`;
      const hasClock = employeeId ? (attendanceIndex.get(clockKey)?.length || 0) > 0 : false;
      const statusClock = date ? getSourceStatus('clock', hasClock) : 'unverified';

      // WhatsApp
      let hasWa = vehicleNorm ? (waIndex.get(lookupKey)?.length || 0) > 0 : false;
      // 檢查手動配對
      const waConfirm = wlConfirms?.get('whatsapp_order');
      if (waConfirm?.status === 'manual_match' && waConfirm.matched_record_id) {
        hasWa = true;
      }
      const statusWhatsapp = date ? getSourceStatus('whatsapp_order', hasWa) : 'unverified';

      // 計算整體狀態
      const allStatuses = [statusReceipt, statusSlip, statusSheet, statusCustomer, statusGps, statusClock, statusWhatsapp];
      const activeStatuses = allStatuses.filter((s) => s !== 'na' && s !== 'unverified');
      let overallStatus = 'unverified';
      if (activeStatuses.length > 0) {
        const matchedCount = activeStatuses.filter((s) => s === 'matched').length;
        const missingCount = activeStatuses.filter((s) => s === 'missing').length;
        if (matchedCount === activeStatuses.length) {
          overallStatus = 'matched';
        } else if (matchedCount > 0) {
          overallStatus = 'diff'; // 部分匹配 → 顯示為有差異
        } else if (missingCount === activeStatuses.length) {
          overallStatus = 'missing';
        } else {
          overallStatus = 'unverified';
        }
      }

      return {
        work_record_id: wl.id,
        date,
        driver: (wl.employee as any)?.nickname || (wl.employee as any)?.name_zh || '—',
        vehicle: wl.equipment_number || '—',
        work_type: wl.service_type || '—',
        customer: (wl.client as any)?.name || '—',
        location: `${wl.start_location || '—'} → ${wl.end_location || '—'}`,
        contract: (wl.contract as any)?.contract_no || '—',
        chit_no: wl.receipt_no || '—',
        status_receipt: statusReceipt,
        status_slip: statusSlip,
        status_sheet: statusSheet,
        status_customer: statusCustomer,
        status_gps: statusGps,
        status_clock: statusClock,
        status_whatsapp: statusWhatsapp,
        // 不再提供 match_id（舊系統），前端改用 work_record_id 調用 matchSingle
        match_id_receipt: null,
        match_id_slip: null,
        match_id_sheet: null,
        match_id_customer: null,
        match_id_gps: null,
        match_id_clock: null,
        match_id_whatsapp: null,
        overall_status: overallStatus,
      };
    });

    // 如果有 filterStatus，在結果中再過濾
    let filteredRecords = records;
    if (filterStatus && filterStatus !== 'all') {
      filteredRecords = records.filter((r) => r.overall_status === filterStatus);
    }

    // ── 統計摘要（基於全部符合篩選條件的工作紀錄，非僅當前頁）──
    // 取得全部 workLog IDs（不分頁）
    const allWorkLogIds = await this.prisma.workLog.findMany({
      where,
      select: { id: true, scheduled_date: true, equipment_number: true, employee_id: true },
      orderBy: orderByClause,
    });

    // 取得全部的 confirmations（用於 summary 計算）
    const allWorkLogIdList = allWorkLogIds.map((wl) => wl.id);
    const allConfirmations = await this.prisma.verificationConfirmation.findMany({
      where: { work_log_id: { in: allWorkLogIdList } },
    });
    const allConfirmMap = new Map<number, Map<string, any>>();
    for (const c of allConfirmations) {
      if (!allConfirmMap.has(c.work_log_id)) allConfirmMap.set(c.work_log_id, new Map());
      allConfirmMap.get(c.work_log_id)!.set(c.source_code, c);
    }

    // 對全部 workLogs 做輕量版狀態計算（只需 overall_status）
    let globalMatched = 0, globalDiff = 0, globalMissing = 0, globalUnverified = 0;
    for (const wl of allWorkLogIds) {
      const date = wl.scheduled_date?.toISOString().slice(0, 10) || '';
      const vehicleNorm = normalizeVehicle(wl.equipment_number);
      const employeeId = wl.employee_id;
      const lookupKey = `${date}|${vehicleNorm}`;
      const wlC = allConfirmMap.get(wl.id);

      const calcStatus = (sourceCode: string, hasAuto: boolean): string => {
        const c = wlC?.get(sourceCode);
        if (c) {
          if (c.status === 'manual_match' || c.status === 'confirmed') return 'matched';
          if (c.status === 'skipped') return 'na';
        }
        return hasAuto ? 'matched' : 'missing';
      };

      if (!date) { globalUnverified++; continue; }

      const sReceipt = calcStatus('receipt', vehicleNorm ? (receiptIndex.get(lookupKey)?.length || 0) > 0 : false);
      const sSlip = calcStatus('slip_chit', vehicleNorm ? (slipIndex.get(lookupKey)?.length || 0) > 0 : false);
      // 功課表/客戶記錄：無手動確認時為 na
      const sSheet = wlC?.get('driver_sheet') ? calcStatus('driver_sheet', false) : 'na';
      const sCustomer = wlC?.get('customer_record') ? calcStatus('customer_record', false) : 'na';
      const sGps = calcStatus('gps', vehicleNorm ? (gpsIndex.get(lookupKey)?.length || 0) > 0 : false);
      const clockKey2 = `${date}|${employeeId}`;
      const sClock = calcStatus('clock', employeeId ? (attendanceIndex.get(clockKey2)?.length || 0) > 0 : false);
      let hasWa2 = vehicleNorm ? (waIndex.get(lookupKey)?.length || 0) > 0 : false;
      const waC = wlC?.get('whatsapp_order');
      if (waC?.status === 'manual_match' && waC.matched_record_id) hasWa2 = true;
      const sWa = calcStatus('whatsapp_order', hasWa2);

      const active = [sReceipt, sSlip, sSheet, sCustomer, sGps, sClock, sWa].filter((s) => s !== 'na' && s !== 'unverified');
      let overall = 'unverified';
      if (active.length > 0) {
        const mc = active.filter((s) => s === 'matched').length;
        const misc = active.filter((s) => s === 'missing').length;
        if (mc === active.length) overall = 'matched';
        else if (mc > 0) overall = 'diff';
        else if (misc === active.length) overall = 'missing';
      }
      if (overall === 'matched') globalMatched++;
      else if (overall === 'diff') globalDiff++;
      else if (overall === 'missing') globalMissing++;
      else globalUnverified++;
    }

    const summary = {
      total_records: total,
      matched_count: globalMatched,
      diff_count: globalDiff,
      missing_count: globalMissing,
      unverified_count: globalUnverified,
    };

    return {
      summary,
      records: filteredRecords,
      pagination: {
        page,
        page_size: pageSize,
        total_pages: Math.ceil(total / pageSize),
        total,
      },
    };
  }

  // 構建空記錄（無日期時使用）
  private buildEmptyRecord(wl: any) {
    return {
      work_record_id: wl.id,
      date: null,
      driver: wl.employee?.nickname || wl.employee?.name_zh || '—',
      vehicle: wl.equipment_number || '—',
      work_type: wl.service_type || '—',
      customer: wl.client?.name || '—',
      location: `${wl.start_location || '—'} → ${wl.end_location || '—'}`,
      contract: wl.contract?.contract_no || '—',
      chit_no: wl.receipt_no || '—',
      status_receipt: 'unverified',
      status_slip: 'unverified',
      status_sheet: 'unverified',
      status_customer: 'unverified',
      status_gps: 'unverified',
      status_clock: 'unverified',
      status_whatsapp: 'unverified',
      match_id_receipt: null,
      match_id_slip: null,
      match_id_sheet: null,
      match_id_customer: null,
      match_id_gps: null,
      match_id_clock: null,
      match_id_whatsapp: null,
      overall_status: 'unverified',
    };
  }

  // ══════════════════════════════════════════════════════════════
  // 單筆配對詳情
  // ══════════════════════════════════════════════════════════════
  async getMatchDetail(matchId: number) {
    const match = await this.prisma.verificationMatch.findUnique({
      where: { id: matchId },
      include: {
        source: true,
        record: {
          include: { chits: true },
        },
      },
    });
    if (!match) {
      throw new NotFoundException('找不到配對記錄');
    }

    // 取得對應的工作紀錄
    const workLog = match.match_work_record_id > 0
      ? await this.prisma.workLog.findUnique({
          where: { id: match.match_work_record_id },
          include: {
            employee: { select: { id: true, name_zh: true, nickname: true } },
            client: { select: { id: true, name: true } },
            contract: { select: { id: true, contract_no: true } },
          },
        })
      : null;

    return {
      match,
      work_log: workLog,
      source_record: match.record,
      diff_fields: match.match_diff_fields,
    };
  }

  // ══════════════════════════════════════════════════════════════
  // 對配對結果進行操作
  // ══════════════════════════════════════════════════════════════
  async performMatchAction(matchId: number, options: MatchActionOptions) {
    const match = await this.prisma.verificationMatch.findUnique({
      where: { id: matchId },
    });
    if (!match) {
      throw new NotFoundException('找不到配對記錄');
    }

    const validActions = ['confirm', 'override', 'ignore', 'manual_correct'];
    if (!validActions.includes(options.action)) {
      throw new BadRequestException(`不支援的操作: ${options.action}`);
    }

    const oldStatus = match.match_status;
    let newStatus = match.match_status;

    switch (options.action) {
      case 'confirm':
        newStatus = 'matched';
        break;
      case 'override':
        newStatus = 'matched';
        // 覆蓋系統資料：將來源資料寫入 WorkLog
        if (options.overrideData && match.match_work_record_id) {
          const updateData: any = {};
          if (options.overrideData.date) updateData.scheduled_date = new Date(options.overrideData.date);
          if (options.overrideData.vehicle) updateData.equipment_number = options.overrideData.vehicle;
          if (options.overrideData.time_in) updateData.start_time = options.overrideData.time_in;
          if (options.overrideData.time_out) updateData.end_time = options.overrideData.time_out;
          if (options.overrideData.weight != null) updateData.quantity = Number(options.overrideData.weight);
          if (options.overrideData.location_from) updateData.start_location = options.overrideData.location_from;
          if (options.overrideData.location_to) updateData.end_location = options.overrideData.location_to;
          if (Object.keys(updateData).length > 0) {
            await this.prisma.workLog.update({
              where: { id: match.match_work_record_id },
              data: updateData,
            });
          }
        }
        break;
      case 'ignore':
        newStatus = 'matched';
        break;
      case 'manual_correct':
        newStatus = 'matched';
        break;
    }

    // 更新配對狀態
    await this.prisma.verificationMatch.update({
      where: { id: matchId },
      data: {
        match_status: newStatus,
        match_resolved_by: options.userId,
        match_resolved_at: new Date(),
        match_resolved_action: options.action,
        match_notes: options.notes || match.match_notes,
      },
    });

    // 記錄操作日誌
    await this.prisma.verificationActionLog.create({
      data: {
        log_user_id: options.userId || 0,
        log_user_name: options.userName,
        log_action_type: options.action,
        log_match_id: matchId,
        log_old_status: oldStatus,
        log_new_status: newStatus,
        log_details: options.overrideData ? { override_data: options.overrideData } : undefined,
      },
    });

    return { success: true, match_id: matchId, old_status: oldStatus, new_status: newStatus };
  }

  // ══════════════════════════════════════════════════════════════
  // 批量操作
  // ══════════════════════════════════════════════════════════════
  async batchAction(options: {
    matchIds: number[];
    action: string;
    notes?: string;
    userId?: number;
    userName?: string;
  }) {
    const { matchIds, action, notes, userId, userName } = options;
    const validActions = ['confirm', 'ignore'];
    if (!validActions.includes(action)) {
      throw new BadRequestException(`批量操作只支援: ${validActions.join(', ')}`);
    }
    if (!matchIds || matchIds.length === 0) {
      throw new BadRequestException('請選擇至少一筆配對記錄');
    }

    const matches = await this.prisma.verificationMatch.findMany({
      where: { id: { in: matchIds } },
    });

    const results: Array<{ match_id: number; old_status: string; new_status: string }> = [];

    for (const match of matches) {
      const oldStatus = match.match_status;
      const newStatus = 'matched';

      await this.prisma.verificationMatch.update({
        where: { id: match.id },
        data: {
          match_status: newStatus,
          match_resolved_by: userId,
          match_resolved_at: new Date(),
          match_resolved_action: action,
          match_notes: notes || match.match_notes,
        },
      });

      // 記錄操作日誌
      await this.prisma.verificationActionLog.create({
        data: {
          log_user_id: userId || 0,
          log_user_name: userName,
          log_action_type: `batch_${action}`,
          log_match_id: match.id,
          log_old_status: oldStatus,
          log_new_status: newStatus,
          log_details: { batch_size: matchIds.length },
        },
      });

      results.push({ match_id: match.id, old_status: oldStatus, new_status: newStatus });
    }

    return {
      success: true,
      action,
      total: matchIds.length,
      processed: results.length,
      results,
    };
  }

  // ══════════════════════════════════════════════════════════════
  // 匯出工作台資料為 Excel
  // ══════════════════════════════════════════════════════════════
  async exportWorkbench(query: WorkbenchQuery): Promise<Buffer> {
    // Fetch all records (no pagination for export)
    const exportQuery = { ...query, page: 1, pageSize: 100000 };
    const result = await this.getWorkbench(exportQuery);
    const records = result.records;

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('核對工作台');

    // Define columns
    sheet.columns = [
      { header: '日期', key: 'date', width: 12 },
      { header: '司機', key: 'driver', width: 12 },
      { header: '車牌', key: 'vehicle', width: 12 },
      { header: '工作類型', key: 'work_type', width: 10 },
      { header: '客戶', key: 'customer', width: 15 },
      { header: '地點', key: 'location', width: 25 },
      { header: '合約', key: 'contract', width: 12 },
      { header: '入帳票號', key: 'chit_no', width: 14 },
      { header: '入帳票', key: 'status_receipt', width: 10 },
      { header: '飛仔', key: 'status_slip', width: 10 },
      { header: '功課表', key: 'status_sheet', width: 10 },
      { header: '客戶記錄', key: 'status_customer', width: 10 },
      { header: 'GPS', key: 'status_gps', width: 10 },
      { header: '打卡', key: 'status_clock', width: 10 },
      { header: 'WhatsApp', key: 'status_whatsapp', width: 10 },
      { header: '整體狀態', key: 'overall_status', width: 10 },
    ];

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };

    const statusLabel: Record<string, string> = {
      matched: '已匹配', diff: '有差異', missing: '系統缺失',
      source_missing: '來源缺失', unverified: '未核對', na: '不適用',
    };

    for (const rec of records) {
      sheet.addRow({
        date: rec.date || '',
        driver: rec.driver,
        vehicle: rec.vehicle,
        work_type: rec.work_type,
        customer: rec.customer,
        location: rec.location,
        contract: rec.contract,
        chit_no: rec.chit_no,
        status_receipt: statusLabel[rec.status_receipt] || rec.status_receipt,
        status_slip: statusLabel[rec.status_slip] || rec.status_slip,
        status_sheet: statusLabel[rec.status_sheet] || rec.status_sheet,
        status_customer: statusLabel[rec.status_customer] || rec.status_customer,
        status_gps: statusLabel[rec.status_gps] || rec.status_gps,
        status_clock: statusLabel[rec.status_clock] || rec.status_clock,
        status_whatsapp: statusLabel[rec.status_whatsapp] || rec.status_whatsapp,
        overall_status: statusLabel[rec.overall_status] || rec.overall_status,
      });
    }

    // Apply conditional formatting colors
    const statusColors: Record<string, string> = {
      '已匹配': 'FF22C55E', '有差異': 'FFF59E0B', '系統缺失': 'FFEF4444',
      '來源缺失': 'FFF97316', '未核對': 'FF9CA3AF', '不適用': 'FFD1D5DB',
    };
    for (let rowIdx = 2; rowIdx <= records.length + 1; rowIdx++) {
      for (let colIdx = 9; colIdx <= 15; colIdx++) {
        const cell = sheet.getRow(rowIdx).getCell(colIdx);
        const color = statusColors[String(cell.value)];
        if (color) {
          cell.font = { color: { argb: color }, bold: true };
        }
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  // ══════════════════════════════════════════════════════════════
  // 批次列表
  // ══════════════════════════════════════════════════════════════
  async getBatches(query: { page: number; limit: number }) {
    const { page, limit } = query;
    const total = await this.prisma.verificationBatch.count();
    const batches = await this.prisma.verificationBatch.findMany({
      include: { source: true },
      orderBy: { batch_upload_time: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: batches.map((b) => ({
        ...b,
        batch_file_size: b.batch_file_size ? Number(b.batch_file_size) : null,
      })),
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    };
  }


  // ══════════════════════════════════════════════════════════════
  // 已匯入資料列表
  // ══════════════════════════════════════════════════════════════
  async getRecords(query: {
    page: number;
    limit: number;
    source_type?: string;
    date_from?: string;
    date_to?: string;
    search?: string;
  }) {
    const { page, limit, source_type, date_from, date_to, search } = query;

    const where: any = {};

    // 按 source_type 篩選（透過 source 關聯）
    if (source_type && source_type !== 'all') {
      where.source = { source_code: source_type };
    }

    // 按日期範圍篩選
    if (date_from || date_to) {
      where.record_work_date = {};
      if (date_from) where.record_work_date.gte = new Date(date_from);
      if (date_to) where.record_work_date.lte = new Date(date_to);
    }

    // 搜尋（車牌、司機名、客戶、地點）
    if (search) {
      where.OR = [
        { record_vehicle_no: { contains: search, mode: 'insensitive' } },
        { record_driver_name: { contains: search, mode: 'insensitive' } },
        { record_customer: { contains: search, mode: 'insensitive' } },
        { record_location_from: { contains: search, mode: 'insensitive' } },
        { record_location_to: { contains: search, mode: 'insensitive' } },
        { record_slip_no: { contains: search, mode: 'insensitive' } },
        { record_contract_no: { contains: search, mode: 'insensitive' } },
      ];
    }

    const total = await this.prisma.verificationRecord.count({ where });
    const records = await this.prisma.verificationRecord.findMany({
      where,
      include: {
        batch: {
          select: {
            batch_code: true,
            batch_period_year: true,
            batch_period_month: true,
            batch_upload_time: true,
          },
        },
        source: {
          select: {
            source_code: true,
            source_name: true,
            source_type: true,
          },
        },
        chits: {
          select: { chit_no: true, chit_seq: true },
          orderBy: { chit_seq: 'asc' },
        },
      },
      orderBy: [
        { record_work_date: 'desc' },
        { id: 'desc' },
      ],
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: records,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  // ══════════════════════════════════════════════════════════════
  // 工具方法
  // ══════════════════════════════════════════════════════════════
  private getCellString(cell: ExcelJS.Cell): string {
    if (!cell || cell.value == null) return '';
    if (cell.value instanceof Date) {
      // 如果是時間格式，使用 UTC 時間返回 HH:mm（ExcelJS 以 UTC 存儲時間值）
      const h = String(cell.value.getUTCHours()).padStart(2, '0');
      const m = String(cell.value.getUTCMinutes()).padStart(2, '0');
      return `${h}:${m}`;
    }
    return String(cell.value).trim();
  }

  private getCellNumber(cell: ExcelJS.Cell): number | null {
    if (!cell || cell.value == null) return null;
    const num = Number(cell.value);
    return isNaN(num) ? null : num;
  }

  private parseTimeToDate(timeStr: string): Date | null {
    if (!timeStr) return null;
    const match = timeStr.match(/(\d{1,2}):(\d{2})/);
    if (!match) return null;
    // Prisma @db.Time() expects a Date but only uses the time part
    const d = new Date('1970-01-01T00:00:00Z');
    d.setUTCHours(parseInt(match[1]), parseInt(match[2]), 0, 0);
    return d;
  }

  private extractTimeFromTimestamp(timestamp: Date): Date | null {
    if (!timestamp) return null;
    const d = new Date('1970-01-01T00:00:00Z');
    d.setUTCHours(timestamp.getHours(), timestamp.getMinutes(), 0, 0);
    return d;
  }

  private formatTime(date: Date | null): string {
    if (!date) return '';
    const h = String(date.getUTCHours()).padStart(2, '0');
    const m = String(date.getUTCMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }

  // ══════════════════════════════════════════════════════════════
  // 刪除批次（只允許 pending/cancelled/failed 狀態）
  // ══════════════════════════════════════════════════════════════
  async deleteBatch(batchId: number) {
    const batch = await this.prisma.verificationBatch.findUnique({
      where: { id: batchId },
    });
    if (!batch) {
      throw new NotFoundException('找不到批次');
    }
    const allowedStatuses = ['pending', 'imported', 'processing', 'cancelled', 'failed'];
    if (!allowedStatuses.includes(batch.batch_status)) {
      throw new BadRequestException(
        `批次狀態為 ${batch.batch_status}，只有 pending/cancelled/failed 狀態的批次可以刪除`,
      );
    }

    // 取得此批次的所有 record IDs
    const records = await this.prisma.verificationRecord.findMany({
      where: { record_batch_id: batchId },
      select: { id: true },
    });
    const recordIds = records.map((r) => r.id);

    // 1. 刪除 verificationRecordChit（通過 record_id）
    if (recordIds.length > 0) {
      await this.prisma.verificationRecordChit.deleteMany({
        where: { chit_record_id: { in: recordIds } },
      });
    }

    // 2. 刪除 verificationMatch（通過 record_id）
    if (recordIds.length > 0) {
      await this.prisma.verificationMatch.deleteMany({
        where: { match_record_id: { in: recordIds } },
      });
    }

    // 3. 刪除 verificationRecord
    await this.prisma.verificationRecord.deleteMany({
      where: { record_batch_id: batchId },
    });

    // 4. 刪除 verificationBatch
    await this.prisma.verificationBatch.delete({
      where: { id: batchId },
    });

    return { success: true, deleted_batch_id: batchId };
  }

  // ══════════════════════════════════════════════════════════════
  // 作廢批次（只允許 completed 狀態）
  // ══════════════════════════════════════════════════════════════
  async cancelBatch(batchId: number) {
    const batch = await this.prisma.verificationBatch.findUnique({
      where: { id: batchId },
    });
    if (!batch) {
      throw new NotFoundException('找不到批次');
    }
    if (batch.batch_status !== 'matched' && batch.batch_status !== 'completed') {
      throw new BadRequestException(
        `批次狀態為 ${batch.batch_status}，只有已配對狀態的批次可以作廢`,
      );
    }

    // 取得此批次的所有 record IDs
    const records = await this.prisma.verificationRecord.findMany({
      where: { record_batch_id: batchId },
      select: { id: true },
    });
    const recordIds = records.map((r) => r.id);

    // 刪除相關的 verificationMatch
    if (recordIds.length > 0) {
      await this.prisma.verificationMatch.deleteMany({
        where: { match_record_id: { in: recordIds } },
      });
    }

    // 將 batch_status 改為 cancelled
    await this.prisma.verificationBatch.update({
      where: { id: batchId },
      data: { batch_status: 'cancelled' },
    });

    return { success: true, cancelled_batch_id: batchId };
  }

  // ══════════════════════════════════════════════════════════════
  // 工具方法
  // ══════════════════════════════════════════════════════════════
  private parseDateString(dateStr: string): string | null {
    if (!dateStr) return null;
    // Try DD/MM/YY format
    const match = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (match) {
      let year = parseInt(match[3]);
      if (year < 100) year += 2000;
      const month = String(match[2]).padStart(2, '0');
      const day = String(match[1]).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    // Try ISO format
    const isoMatch = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) return dateStr;
    return null;
  }
}
