import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as ExcelJS from 'exceljs';
import * as crypto from 'crypto';
import * as fs from 'fs';

// ══════════════════════════════════════════════════════════════
// GPS 追蹤報表匯入及每日摘要服務
// ══════════════════════════════════════════════════════════════

interface GpsMetadata {
  company: string;
  reportDate: string;
  startTime: string;
  endTime: string;
  totalKm: number;
}

interface GpsRawRow {
  datetime: string;
  company: string;
  vehicle_no: string;
  latitude: string;
  longitude: string;
  region: string;
  district: string;
  sub_district: string;
  street: string;
  building: string;
  direction: string;
  speed: number;
  status: string;
  delay_seconds: number;
  event: string;
  mileage: number;
  ic_card: string;
}

interface DaySummary {
  vehicle_no: string;
  date: string;
  first_engine_on: string | null;
  last_engine_off: string | null;
  total_km: number;
  locations: string[];
  raw_point_count: number;
}

@Injectable()
export class GpsService {
  constructor(private readonly prisma: PrismaService) {}

  // ══════════════════════════════════════════════════════════════
  // 上傳並處理 GPS Excel
  // ══════════════════════════════════════════════════════════════
  async uploadAndProcessGps(
    file: Express.Multer.File,
    options: {
      periodYear?: number;
      periodMonth?: number;
      userId?: number;
    },
  ) {
    if (!file) {
      throw new BadRequestException('請上傳 GPS 追蹤報表 Excel 檔案');
    }

    // 查找 GPS 來源
    const source = await this.prisma.verificationSource.findUnique({
      where: { source_code: 'gps' },
    });
    if (!source) {
      throw new BadRequestException('找不到 GPS 來源設定');
    }

    // 計算檔案 hash 檢查重複
    const fileBuffer = fs.readFileSync(file.path);
    const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    const existingBatch = await this.prisma.verificationBatch.findFirst({
      where: { batch_file_hash: fileHash },
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

    // 建立批次
    const today = new Date().toISOString().slice(0, 10);
    const existingCount = await this.prisma.verificationBatch.count({
      where: { batch_code: { startsWith: `BATCH-${today}-gps` } },
    });
    const batchCode = `BATCH-${today}-gps-${String(existingCount + 1).padStart(3, '0')}`;
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');

    const batch = await this.prisma.verificationBatch.create({
      data: {
        batch_code: batchCode,
        batch_source_id: source.id,
        batch_file_name: originalName,
        batch_file_size: BigInt(file.size),
        batch_file_hash: fileHash,
        batch_upload_user_id: options.userId,
        batch_period_year: options.periodYear,
        batch_period_month: options.periodMonth,
        batch_status: 'processing',
        batch_processing_started_at: new Date(),
        batch_notes: 'GPS 追蹤報表匯入',
      },
    });

    try {
      // 1. 解析 Excel
      const { metadata, rows: rawRows } = await this.parseGpsExcel(file.path);

      // 2. 按車牌+日期聚合為每日摘要
      const dailySummaries = this.aggregateDailySummaries(rawRows);

      // 3. 更新批次統計
      await this.prisma.verificationBatch.update({
        where: { id: batch.id },
        data: {
          batch_total_rows: rawRows.length,
          batch_filtered_rows: dailySummaries.length,
        },
      });

      // 4. 儲存每日摘要到 verification_gps_summaries 和 verification_records
      const summaries: any[] = [];
      for (const ds of dailySummaries) {
        try {
          // 建立 GPS summary
          const gpsSummary = await this.prisma.verificationGpsSummary.create({
            data: {
              gps_summary_batch_id: batch.id,
              gps_summary_vehicle_no: ds.vehicle_no,
              gps_summary_date: new Date(ds.date),
              gps_summary_start_time: ds.first_engine_on ? new Date(ds.first_engine_on) : null,
              gps_summary_end_time: ds.last_engine_off ? new Date(ds.last_engine_off) : null,
              gps_summary_total_distance: ds.total_km,
              gps_summary_trip_count: null,
              gps_summary_locations: ds.locations,
              gps_summary_raw_points: ds.raw_point_count,
              gps_summary_ai_model: null,
            },
          });

          // 同時建立 verification_record 讓 GPS tab 能顯示
          await this.prisma.verificationRecord.create({
            data: {
              record_batch_id: batch.id,
              record_source_id: source.id,
              record_work_date: new Date(ds.date),
              record_vehicle_no: ds.vehicle_no,
              record_location_from: ds.locations.length > 0 ? ds.locations.slice(0, 3).join(', ') : null,
              record_location_to: ds.locations.length > 3 ? ds.locations.slice(3, 6).join(', ') : null,
              record_time_in: ds.first_engine_on ? this.extractTimeAsDate(ds.first_engine_on) : null,
              record_time_out: ds.last_engine_off ? this.extractTimeAsDate(ds.last_engine_off) : null,
              record_quantity: ds.total_km > 0 ? `${ds.total_km.toFixed(1)} km` : null,
              record_raw_data: {
                gps_summary_id: gpsSummary.id,
                gps_first_engine_on: ds.first_engine_on,
                gps_last_engine_off: ds.last_engine_off,
                gps_total_km: ds.total_km,
                gps_locations: ds.locations,
                gps_raw_point_count: ds.raw_point_count,
                metadata: {
                  company: metadata.company,
                  report_date: metadata.reportDate,
                  report_total_km: metadata.totalKm,
                },
              },
            },
          });

          summaries.push({
            id: gpsSummary.id,
            vehicle_no: ds.vehicle_no,
            date: ds.date,
            first_engine_on: ds.first_engine_on,
            last_engine_off: ds.last_engine_off,
            total_distance: ds.total_km,
            locations: ds.locations,
            raw_point_count: ds.raw_point_count,
            status: 'completed',
          });
        } catch (error: any) {
          console.error(`[GpsService] Failed to save ${ds.vehicle_no} ${ds.date}:`, error.message);
          summaries.push({
            vehicle_no: ds.vehicle_no,
            date: ds.date,
            status: 'failed',
            error: error.message,
          });
        }
      }

      // 5. 更新批次狀態
      const failedCount = summaries.filter((s) => s.status === 'failed').length;
      await this.prisma.verificationBatch.update({
        where: { id: batch.id },
        data: {
          batch_status: failedCount === dailySummaries.length ? 'failed' : 'imported',
          batch_processing_completed_at: new Date(),
          batch_error_message: failedCount > 0 ? `${failedCount}/${dailySummaries.length} 組摘要儲存失敗` : null,
        },
      });

      return {
        batch_id: batch.id,
        batch_code: batchCode,
        total_raw_rows: rawRows.length,
        vehicle_day_groups: dailySummaries.length,
        summaries_completed: summaries.filter((s) => s.status === 'completed').length,
        summaries_failed: failedCount,
        metadata: {
          company: metadata.company,
          report_date: metadata.reportDate,
          start_time: metadata.startTime,
          end_time: metadata.endTime,
          total_km: metadata.totalKm,
        },
        summaries,
      };
    } catch (error: any) {
      await this.prisma.verificationBatch.update({
        where: { id: batch.id },
        data: {
          batch_status: 'failed',
          batch_processing_completed_at: new Date(),
          batch_error_message: error.message,
        },
      });
      throw new BadRequestException(`GPS 報表處理失敗: ${error.message}`);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // 解析 GPS Excel（Autotoll 追蹤報表格式）
  // ══════════════════════════════════════════════════════════════
  private async parseGpsExcel(filePath: string): Promise<{ metadata: GpsMetadata; rows: GpsRawRow[] }> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const sheet = workbook.worksheets[0];
    if (!sheet) {
      throw new BadRequestException('Excel 檔案沒有工作表');
    }

    // 解析 metadata (rows 1-6)
    const metadata: GpsMetadata = {
      company: '',
      reportDate: '',
      startTime: '',
      endTime: '',
      totalKm: 0,
    };

    // Row 2: 所在戶口
    const row2 = sheet.getRow(2);
    metadata.company = this.getCellString(row2, 2);

    // Row 3: 報表日期
    const row3 = sheet.getRow(3);
    metadata.reportDate = this.getCellString(row3, 2);

    // Row 4: 開始時間
    const row4 = sheet.getRow(4);
    metadata.startTime = this.getCellString(row4, 2);

    // Row 5: 結束時間
    const row5 = sheet.getRow(5);
    metadata.endTime = this.getCellString(row5, 2);

    // Row 6: 報表內總里程
    const row6 = sheet.getRow(6);
    const totalKmStr = this.getCellString(row6, 2);
    metadata.totalKm = parseFloat(totalKmStr) || 0;

    // Row 7 is header, Row 8+ is data
    // Fixed column positions based on Autotoll format:
    // 1:日期(時間) 2:所在戶口 3:車牌號碼 4:緯度 5:經度 6:區域 7:地區 8:分區 9:街道
    // 10:建築物 11:方向 12:速度 13:狀況 14:接收時間差(秒) 15:事件 16:里程（公里）17:IC卡號

    const rows: GpsRawRow[] = [];
    const totalRows = sheet.rowCount;

    for (let rowIdx = 8; rowIdx <= totalRows; rowIdx++) {
      const row = sheet.getRow(rowIdx);
      const datetime = this.getCellString(row, 1);
      if (!datetime) continue;

      const vehicleNo = this.getCellString(row, 3);
      if (!vehicleNo) continue;

      rows.push({
        datetime,
        company: this.getCellString(row, 2),
        vehicle_no: vehicleNo,
        latitude: this.getCellString(row, 4),
        longitude: this.getCellString(row, 5),
        region: this.getCellString(row, 6),
        district: this.getCellString(row, 7),
        sub_district: this.getCellString(row, 8),
        street: this.getCellString(row, 9),
        building: this.getCellString(row, 10),
        direction: this.getCellString(row, 11),
        speed: parseFloat(this.getCellString(row, 12)) || 0,
        status: this.getCellString(row, 13),
        delay_seconds: parseInt(this.getCellString(row, 14)) || 0,
        event: this.getCellString(row, 15),
        mileage: parseFloat(this.getCellString(row, 16)) || 0,
        ic_card: this.getCellString(row, 17),
      });
    }

    return { metadata, rows };
  }

  // ══════════════════════════════════════════════════════════════
  // 按車牌+日期聚合為每日 GPS 摘要
  // ══════════════════════════════════════════════════════════════
  private aggregateDailySummaries(rows: GpsRawRow[]): DaySummary[] {
    const groups = new Map<string, GpsRawRow[]>();

    for (const row of rows) {
      // 從 datetime 提取日期部分
      const match = row.datetime.match(/(\d{4}[-/]\d{2}[-/]\d{2})/);
      if (!match) continue;

      const dateStr = match[1].replace(/\//g, '-');
      const key = `${row.vehicle_no}|${dateStr}`;

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(row);
    }

    const summaries: DaySummary[] = [];

    for (const [key, dayRows] of groups.entries()) {
      const [vehicleNo, dateStr] = key.split('|');

      // 按時間排序
      dayRows.sort((a, b) => a.datetime.localeCompare(b.datetime));

      // 計算首次開引擎時間
      let firstEngineOn: string | null = null;
      let lastEngineOff: string | null = null;

      for (const r of dayRows) {
        if (r.status === '閒置-開引擎' || r.status === '行車-開引擎' || r.status === '無GPS訊號-開引擎') {
          if (!firstEngineOn) {
            firstEngineOn = r.datetime;
          }
        }
      }

      // 最後關引擎時間：從後往前找
      for (let i = dayRows.length - 1; i >= 0; i--) {
        if (dayRows[i].status === '關引擎') {
          // 只有在有開引擎記錄的情況下才記錄最後關引擎
          if (firstEngineOn) {
            lastEngineOff = dayRows[i].datetime;
          }
          break;
        }
      }

      // 計算當天總里程（累加所有里程增量）
      let totalKm = 0;
      for (const r of dayRows) {
        totalKm += r.mileage;
      }
      totalKm = Math.round(totalKm * 100) / 100;

      // 收集主要位置（去重，格式：分區-街道）
      const locationSet = new Set<string>();
      for (const r of dayRows) {
        if (r.sub_district && r.sub_district !== '--' && r.street && r.street !== '--') {
          locationSet.add(`${r.sub_district}-${r.street}`);
        } else if (r.sub_district && r.sub_district !== '--') {
          locationSet.add(r.sub_district);
        }
      }
      const locations = Array.from(locationSet);

      summaries.push({
        vehicle_no: vehicleNo,
        date: dateStr,
        first_engine_on: firstEngineOn,
        last_engine_off: lastEngineOff,
        total_km: totalKm,
        locations,
        raw_point_count: dayRows.length,
      });
    }

    // 按日期排序
    summaries.sort((a, b) => a.date.localeCompare(b.date));

    return summaries;
  }

  // ══════════════════════════════════════════════════════════════
  // 工具方法
  // ══════════════════════════════════════════════════════════════
  private getCellString(row: ExcelJS.Row, colIndex: number): string {
    const cell = row.getCell(colIndex);
    if (!cell || cell.value == null) return '';
    if (cell.value instanceof Date) {
      return cell.value.toISOString();
    }
    return String(cell.value).trim();
  }

  private extractTimeAsDate(datetimeStr: string): Date | null {
    if (!datetimeStr) return null;
    const match = datetimeStr.match(/(\d{2}):(\d{2}):?(\d{2})?/);
    if (!match) return null;
    const d = new Date('1970-01-01T00:00:00Z');
    d.setUTCHours(parseInt(match[1]), parseInt(match[2]), parseInt(match[3] || '0'), 0);
    return d;
  }
}
