import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as ExcelJS from 'exceljs';
import * as crypto from 'crypto';
import * as fs from 'fs';

interface UploadOptions {
  sourceType: string;
  periodYear?: number;
  periodMonth?: number;
  notes?: string;
  userId?: number;
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

@Injectable()
export class VerificationService {
  constructor(private readonly prisma: PrismaService) {}

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
    const existingBatch = await this.prisma.verificationBatch.findFirst({
      where: { batch_file_hash: fileHash },
    });
    if (existingBatch) {
      throw new BadRequestException(
        `此檔案已於 ${existingBatch.batch_upload_time.toISOString().slice(0, 10)} 上傳過（批次: ${existingBatch.batch_code}）`,
      );
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
    let parseResult: { totalRows: number; filteredRows: number; previewData: any[] };

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
        batch_file_name: file.originalname,
        batch_file_size: BigInt(file.size),
        batch_file_hash: fileHash,
        batch_upload_user_id: options.userId,
        batch_period_year: options.periodYear,
        batch_period_month: options.periodMonth,
        batch_total_rows: parseResult.totalRows,
        batch_filtered_rows: parseResult.filteredRows,
        batch_status: 'pending',
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
      filtered_rows: parseResult.filteredRows,
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

    // 找到各欄位的索引
    const colMap: Record<string, number> = {};
    headers.forEach((h, idx) => {
      const lower = h.toLowerCase();
      if (lower.includes('facility')) colMap.facility = idx;
      else if (lower.includes('date') && lower.includes('transaction')) colMap.date = idx;
      else if (lower.includes('vehicle')) colMap.vehicle = idx;
      else if (lower.includes('account')) colMap.account = idx;
      else if (lower.includes('chit')) colMap.chit = idx;
      else if (lower === 'time-in' || lower === 'time in') colMap.time_in = idx;
      else if (lower === 'time-out' || lower === 'time out') colMap.time_out = idx;
      else if (lower.includes('waste depth')) colMap.waste_depth = idx;
      else if (lower.includes('weight-in') || lower.includes('weight in')) colMap.weight_in = idx;
      else if (lower.includes('weight-out') || lower.includes('weight out')) colMap.weight_out = idx;
      else if (lower.includes('net weight') || lower.includes('net_weight')) colMap.net_weight = idx;
    });

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // 跳過表頭

      const vehicleNo = this.getCellString(row.getCell(colMap.vehicle));
      if (!vehicleNo) return;

      const rawDate = row.getCell(colMap.date).value;
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
        facility: this.getCellString(row.getCell(colMap.facility)),
        work_date: workDate,
        vehicle_no: vehicleNo,
        account_no: this.getCellString(row.getCell(colMap.account)),
        chit_no: this.getCellString(row.getCell(colMap.chit)),
        time_in: this.getCellString(row.getCell(colMap.time_in)),
        time_out: this.getCellString(row.getCell(colMap.time_out)),
        waste_depth: this.getCellNumber(row.getCell(colMap.waste_depth)),
        weight_in: this.getCellNumber(row.getCell(colMap.weight_in)),
        weight_out: this.getCellNumber(row.getCell(colMap.weight_out)),
        net_weight: this.getCellNumber(row.getCell(colMap.net_weight)),
      });
    });

    // 用公司車牌篩選
    const filteredRows = allRows.filter((row) => {
      const plateNorm = (row.vehicle_no || '').toUpperCase().replace(/\s+/g, '');
      return companyPlates.has(plateNorm);
    });

    return {
      totalRows: allRows.length,
      filteredRows: filteredRows.length,
      previewData: filteredRows,
    };
  }

  // ══════════════════════════════════════════════════════════════
  // 確認匯入並開始自動配對
  // ══════════════════════════════════════════════════════════════
  async confirmBatchAndMatch(batchId: number, userId?: number) {
    const batch = await this.prisma.verificationBatch.findUnique({
      where: { id: batchId },
      include: { source: true },
    });
    if (!batch) {
      throw new NotFoundException('找不到批次');
    }
    if (batch.batch_status !== 'pending') {
      throw new BadRequestException(`批次狀態為 ${batch.batch_status}，無法確認`);
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

      // 取得 receipt source id
      const receiptSource = await this.prisma.verificationSource.findUnique({
        where: { source_code: 'receipt' },
      });
      if (!receiptSource) {
        throw new Error('找不到 receipt 來源');
      }

      for (const record of records) {
        const chitNos = record.chits.map((c) => c.chit_no);
        if (chitNos.length === 0) continue;

        // 用 chit_no 配對 WorkLog
        for (const chitNo of chitNos) {
          const workLogs = await this.prisma.workLog.findMany({
            where: {
              receipt_no: chitNo,
            },
            include: {
              employee: true,
              company_profile: true,
              client: true,
            },
          });

          if (workLogs.length === 0) {
            // 缺失：入帳票有記錄但系統沒有對應的工作紀錄
            // 我們先不建立 match，因為沒有 work_record_id
            missingCount++;
            continue;
          }

          for (const wl of workLogs) {
            // 比較差異
            const diffFields: Record<string, any> = {};
            let diffFieldCount = 0;

            // 比較日期
            if (record.record_work_date && wl.scheduled_date) {
              const recDate = record.record_work_date.toISOString().slice(0, 10);
              const wlDate = wl.scheduled_date.toISOString().slice(0, 10);
              if (recDate !== wlDate) {
                diffFields['date'] = { sys: wlDate, src: recDate, diff: '日期不同' };
                diffFieldCount++;
              }
            }

            // 比較時間
            if (record.record_time_in) {
              const recTimeIn = this.formatTime(record.record_time_in);
              const wlTimeIn = wl.start_time || '';
              if (recTimeIn && wlTimeIn && recTimeIn !== wlTimeIn) {
                diffFields['time_in'] = { sys: wlTimeIn, src: recTimeIn, diff: '進入時間不同' };
                diffFieldCount++;
              }
            }

            if (record.record_time_out) {
              const recTimeOut = this.formatTime(record.record_time_out);
              const wlTimeOut = wl.end_time || '';
              if (recTimeOut && wlTimeOut && recTimeOut !== wlTimeOut) {
                diffFields['time_out'] = { sys: wlTimeOut, src: recTimeOut, diff: '離開時間不同' };
                diffFieldCount++;
              }
            }

            // 比較重量
            if (record.record_weight_net != null && wl.quantity != null) {
              const recWeight = Number(record.record_weight_net);
              const wlQty = Number(wl.quantity);
              if (Math.abs(recWeight - wlQty) > 0.5) {
                diffFields['weight'] = {
                  sys: String(wlQty),
                  src: String(recWeight),
                  diff: `${recWeight > wlQty ? '+' : ''}${(recWeight - wlQty).toFixed(2)}噸`,
                };
                diffFieldCount++;
              }
            }

            const matchStatus = diffFieldCount > 0 ? 'diff' : 'matched';
            if (matchStatus === 'matched') matchedCount++;
            else diffCount++;

            // 建立配對記錄
            await this.prisma.verificationMatch.create({
              data: {
                match_work_record_id: wl.id,
                match_source_id: receiptSource.id,
                match_record_id: record.id,
                match_status: matchStatus,
                match_confidence: diffFieldCount === 0 ? 100 : Math.max(50, 100 - diffFieldCount * 15),
                match_diff_fields: diffFieldCount > 0 ? diffFields : undefined,
                match_diff_count: diffFieldCount,
              },
            });
          }
        }
      }

      // 更新批次狀態
      await this.prisma.verificationBatch.update({
        where: { id: batchId },
        data: {
          batch_status: 'completed',
          batch_processing_completed_at: new Date(),
        },
      });

      return {
        batch_id: batchId,
        status: 'completed',
        matched_count: matchedCount,
        diff_count: diffCount,
        missing_count: missingCount,
        total_records: records.length,
      };
    } catch (error) {
      await this.prisma.verificationBatch.update({
        where: { id: batchId },
        data: {
          batch_status: 'failed',
          batch_error_message: error.message || '配對過程發生錯誤',
          batch_processing_completed_at: new Date(),
        },
      });
      throw error;
    }
  }

  // ══════════════════════════════════════════════════════════════
  // 核對工作台
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

    // 取得所有來源
    const sources = await this.prisma.verificationSource.findMany({
      where: { source_is_active: true },
      orderBy: { id: 'asc' },
    });
    const sourceMap = new Map(sources.map((s) => [s.source_code, s]));

    // 查詢工作紀錄
    const orderBy: any = {};
    if (sortBy === 'date') orderBy.scheduled_date = sortOrder === 'asc' ? 'asc' : 'desc';
    else if (sortBy === 'vehicle') orderBy.equipment_number = sortOrder === 'asc' ? 'asc' : 'desc';
    else orderBy.scheduled_date = 'desc';

    const total = await this.prisma.workLog.count({ where });
      const workLogs = await this.prisma.workLog.findMany({
      where,
      include: {
        employee: { select: { id: true, name_zh: true, nickname: true } },
        client: { select: { id: true, name: true } },
        contract: { select: { id: true, contract_no: true } },
        company_profile: { select: { id: true, chinese_name: true } },
      },
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    // 取得這些工作紀錄的所有配對結果
    const workLogIds = workLogs.map((wl) => wl.id);
    const matches = await this.prisma.verificationMatch.findMany({
      where: { match_work_record_id: { in: workLogIds } },
      include: { source: true },
    });

    // 按工作紀錄 ID 分組配對結果
    const matchMap = new Map<number, any[]>();
    for (const m of matches) {
      if (!matchMap.has(m.match_work_record_id)) {
        matchMap.set(m.match_work_record_id, []);
      }
      matchMap.get(m.match_work_record_id)!.push(m);
    }

    // 定義 7 個來源的狀態欄位
    const sourceKeys = ['receipt', 'slip_chit', 'driver_sheet', 'customer_record', 'gps', 'clock', 'whatsapp_order'];

    // 構建回應資料
    const records = workLogs.map((wl) => {
      const wlMatches = matchMap.get(wl.id) || [];
      const statusBySource: Record<string, string> = {};

      for (const key of sourceKeys) {
        const src = sourceMap.get(key);
        if (!src) {
          statusBySource[key] = 'na';
          continue;
        }
        const match = wlMatches.find((m) => m.match_source_id === src.id);
        if (match) {
          statusBySource[key] = match.match_status;
        } else {
          statusBySource[key] = 'unverified';
        }
      }

      // 計算整體狀態
      const statuses = Object.values(statusBySource).filter((s) => s !== 'na' && s !== 'unverified');
      let overallStatus = 'unverified';
      if (statuses.length > 0) {
        if (statuses.includes('missing')) overallStatus = 'missing';
        else if (statuses.includes('diff')) overallStatus = 'diff';
        else if (statuses.every((s) => s === 'matched')) overallStatus = 'matched';
        else overallStatus = 'unverified';
      }

      return {
        work_record_id: wl.id,
        date: wl.scheduled_date ? wl.scheduled_date.toISOString().slice(0, 10) : null,
        driver: (wl.employee as any)?.nickname || (wl.employee as any)?.name_zh || '—',
        vehicle: wl.equipment_number || '—',
        work_type: wl.service_type || '—',
        customer: (wl.client as any)?.name || '—',
        location: `${wl.start_location || '—'} → ${wl.end_location || '—'}`,
        contract: (wl.contract as any)?.contract_no || '—',
        chit_no: wl.receipt_no || '—',
        status_receipt: statusBySource['receipt'],
        status_slip: statusBySource['slip_chit'],
        status_sheet: statusBySource['driver_sheet'],
        status_customer: statusBySource['customer_record'],
        status_gps: statusBySource['gps'],
        status_clock: statusBySource['clock'],
        status_whatsapp: statusBySource['whatsapp_order'],
        overall_status: overallStatus,
      };
    });

    // 如果有 filterStatus，在結果中再過濾
    let filteredRecords = records;
    if (filterStatus && filterStatus !== 'all') {
      filteredRecords = records.filter((r) => r.overall_status === filterStatus);
    }

    // 統計摘要
    const allMatchStatuses = await this.prisma.verificationMatch.groupBy({
      by: ['match_status'],
      _count: { id: true },
    });
    const summary = {
      total_records: total,
      matched_count: allMatchStatuses.find((s) => s.match_status === 'matched')?._count?.id || 0,
      diff_count: allMatchStatuses.find((s) => s.match_status === 'diff')?._count?.id || 0,
      missing_count: allMatchStatuses.find((s) => s.match_status === 'missing')?._count?.id || 0,
      unverified_count: allMatchStatuses.find((s) => s.match_status === 'unverified')?._count?.id || 0,
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
    const workLog = await this.prisma.workLog.findUnique({
      where: { id: match.match_work_record_id },
      include: {
        employee: { select: { id: true, name_zh: true, nickname: true } },
        client: { select: { id: true, name: true } },
        contract: { select: { id: true, contract_no: true } },
      },
    });

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
        // TODO: 覆蓋系統資料
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
  // 工具方法
  // ══════════════════════════════════════════════════════════════
  private getCellString(cell: ExcelJS.Cell): string {
    if (!cell || cell.value == null) return '';
    if (cell.value instanceof Date) {
      // 如果是時間格式，返回 HH:mm
      const h = String(cell.value.getHours()).padStart(2, '0');
      const m = String(cell.value.getMinutes()).padStart(2, '0');
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

  private formatTime(date: Date | null): string {
    if (!date) return '';
    const h = String(date.getUTCHours()).padStart(2, '0');
    const m = String(date.getUTCMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }

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
