import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import OpenAI from 'openai';
import * as ExcelJS from 'exceljs';
import * as fs from 'fs';

// ══════════════════════════════════════════════════════════════
// GPS 追蹤報表匯入及 AI 行程摘要服務
// ══════════════════════════════════════════════════════════════

interface GpsRawRow {
  vehicle_no: string;
  datetime: string;
  latitude: string;
  longitude: string;
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

interface VehicleDayData {
  vehicle_no: string;
  date: string;
  rows: GpsRawRow[];
}

@Injectable()
export class GpsService {
  private openai: OpenAI;

  constructor(private readonly prisma: PrismaService) {
    this.openai = new OpenAI();
  }

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
        batch_file_size: file.size,
        batch_upload_user_id: options.userId,
        batch_period_year: options.periodYear,
        batch_period_month: options.periodMonth,
        batch_status: 'processing',
        batch_processing_started_at: new Date(),
        batch_notes: 'GPS 追蹤報表匯入',
      },
    });

    try {
      // 解析 Excel
      const rawRows = await this.parseGpsExcel(file.path);

      // 按車牌+日期分組
      const vehicleDayGroups = this.groupByVehicleDay(rawRows);

      await this.prisma.verificationBatch.update({
        where: { id: batch.id },
        data: {
          batch_total_rows: rawRows.length,
          batch_filtered_rows: vehicleDayGroups.length,
        },
      });

      // 逐組使用 AI 生成行程摘要
      const summaries: any[] = [];
      for (const group of vehicleDayGroups) {
        try {
          const summary = await this.generateDailySummary(group);
          const record = await this.prisma.verificationGpsSummary.create({
            data: {
              gps_summary_batch_id: batch.id,
              gps_summary_vehicle_no: group.vehicle_no,
              gps_summary_date: new Date(group.date),
              gps_summary_start_time: summary.start_time ? new Date(summary.start_time) : null,
              gps_summary_end_time: summary.end_time ? new Date(summary.end_time) : null,
              gps_summary_total_distance: summary.total_distance,
              gps_summary_trip_count: summary.trip_count,
              gps_summary_locations: summary.locations,
              gps_summary_raw_points: group.rows.length,
              gps_summary_ai_model: 'gpt-4.1-mini',
            },
          });
          summaries.push({
            id: record.id,
            vehicle_no: group.vehicle_no,
            date: group.date,
            trip_count: summary.trip_count,
            total_distance: summary.total_distance,
            status: 'completed',
          });
        } catch (error: any) {
          console.error(`[GpsService] Failed to process ${group.vehicle_no} ${group.date}:`, error.message);
          summaries.push({
            vehicle_no: group.vehicle_no,
            date: group.date,
            status: 'failed',
            error: error.message,
          });
        }
      }

      // 更新批次狀態
      const failedCount = summaries.filter((s) => s.status === 'failed').length;
      await this.prisma.verificationBatch.update({
        where: { id: batch.id },
        data: {
          batch_status: failedCount === vehicleDayGroups.length ? 'failed' : 'imported',
          batch_processing_completed_at: new Date(),
          batch_error_message: failedCount > 0 ? `${failedCount}/${vehicleDayGroups.length} 組摘要生成失敗` : null,
        },
      });

      return {
        batch_id: batch.id,
        batch_code: batchCode,
        total_raw_rows: rawRows.length,
        vehicle_day_groups: vehicleDayGroups.length,
        summaries_completed: summaries.filter((s) => s.status === 'completed').length,
        summaries_failed: failedCount,
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
  // 解析 GPS Excel（Autotoll 格式）
  // ══════════════════════════════════════════════════════════════
  private async parseGpsExcel(filePath: string): Promise<GpsRawRow[]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const rows: GpsRawRow[] = [];
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      throw new BadRequestException('Excel 檔案沒有工作表');
    }

    // 找到表頭行（尋找包含「車牌」或「日期」的行）
    let headerRow = 0;
    const headerMap: Record<string, number> = {};

    sheet.eachRow((row, rowNumber) => {
      if (headerRow > 0) return;
      const values = row.values as any[];
      for (let i = 1; i < values.length; i++) {
        const cell = String(values[i] || '').trim();
        if (cell === '車牌' || cell === '車牌號碼' || cell.toLowerCase() === 'vehicle') {
          headerRow = rowNumber;
          break;
        }
      }
    });

    if (headerRow === 0) {
      // 假設第一行是表頭
      headerRow = 1;
    }

    // 建立表頭映射
    const headerRowValues = sheet.getRow(headerRow).values as any[];
    const knownHeaders: Record<string, string> = {
      '車牌': 'vehicle_no',
      '車牌號碼': 'vehicle_no',
      '日期時間': 'datetime',
      '日期': 'datetime',
      '緯度': 'latitude',
      '經度': 'longitude',
      '地區': 'district',
      '分區': 'sub_district',
      '街道': 'street',
      '建築物': 'building',
      '方向': 'direction',
      '速度': 'speed',
      '狀況': 'status',
      '接收時間差(秒)': 'delay_seconds',
      '事件': 'event',
      '里程': 'mileage',
      'IC卡號': 'ic_card',
    };

    for (let i = 1; i < headerRowValues.length; i++) {
      const cell = String(headerRowValues[i] || '').trim();
      if (knownHeaders[cell]) {
        headerMap[knownHeaders[cell]] = i;
      }
    }

    // 讀取資料行
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber <= headerRow) return;
      const values = row.values as any[];

      const vehicleNo = headerMap.vehicle_no ? String(values[headerMap.vehicle_no] || '').trim() : '';
      if (!vehicleNo) return;

      rows.push({
        vehicle_no: vehicleNo,
        datetime: headerMap.datetime ? String(values[headerMap.datetime] || '').trim() : '',
        latitude: headerMap.latitude ? String(values[headerMap.latitude] || '').trim() : '',
        longitude: headerMap.longitude ? String(values[headerMap.longitude] || '').trim() : '',
        district: headerMap.district ? String(values[headerMap.district] || '').trim() : '',
        sub_district: headerMap.sub_district ? String(values[headerMap.sub_district] || '').trim() : '',
        street: headerMap.street ? String(values[headerMap.street] || '').trim() : '',
        building: headerMap.building ? String(values[headerMap.building] || '').trim() : '',
        direction: headerMap.direction ? String(values[headerMap.direction] || '').trim() : '',
        speed: headerMap.speed ? Number(values[headerMap.speed] || 0) : 0,
        status: headerMap.status ? String(values[headerMap.status] || '').trim() : '',
        delay_seconds: headerMap.delay_seconds ? Number(values[headerMap.delay_seconds] || 0) : 0,
        event: headerMap.event ? String(values[headerMap.event] || '').trim() : '',
        mileage: headerMap.mileage ? Number(values[headerMap.mileage] || 0) : 0,
        ic_card: headerMap.ic_card ? String(values[headerMap.ic_card] || '').trim() : '',
      });
    });

    return rows;
  }

  // ══════════════════════════════════════════════════════════════
  // 按車牌+日期分組
  // ══════════════════════════════════════════════════════════════
  private groupByVehicleDay(rows: GpsRawRow[]): VehicleDayData[] {
    const groups = new Map<string, GpsRawRow[]>();

    for (const row of rows) {
      // 從 datetime 提取日期部分
      let dateStr = '';
      if (row.datetime) {
        const match = row.datetime.match(/(\d{4}[-/]\d{2}[-/]\d{2})/);
        if (match) {
          dateStr = match[1].replace(/\//g, '-');
        }
      }
      if (!dateStr) continue;

      const key = `${row.vehicle_no}|${dateStr}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(row);
    }

    return Array.from(groups.entries()).map(([key, rows]) => {
      const [vehicle_no, date] = key.split('|');
      return { vehicle_no, date, rows };
    });
  }

  // ══════════════════════════════════════════════════════════════
  // 使用 AI 生成每日行程摘要
  // ══════════════════════════════════════════════════════════════
  private async generateDailySummary(group: VehicleDayData) {
    // 準備 GPS 資料摘要（限制 token 數量）
    const dataLines = group.rows.map((r) => {
      return `${r.datetime} | ${r.district} ${r.sub_district} ${r.street} | ${r.status} | ${r.event || '--'} | 速度:${r.speed} | 里程:${r.mileage}`;
    });

    // 如果資料太多，取樣
    let dataText: string;
    if (dataLines.length > 200) {
      // 取關鍵事件行 + 每 5 分鐘取樣
      const keyEvents = dataLines.filter((_, i) => {
        const row = group.rows[i];
        return row.event && row.event !== '--' && row.event !== '';
      });
      const sampled = dataLines.filter((_, i) => i % 5 === 0);
      const combined = [...new Set([...keyEvents, ...sampled])];
      combined.sort();
      dataText = combined.join('\n');
    } else {
      dataText = dataLines.join('\n');
    }

    const prompt = `你是一個 GPS 行程分析助手。以下是車牌 ${group.vehicle_no} 在 ${group.date} 的 GPS 追蹤資料（Autotoll 格式）。

請分析這些 GPS 資料，生成每日行程摘要。

GPS 資料（格式：日期時間 | 地區 | 狀況 | 事件 | 速度 | 里程）：
${dataText}

請返回以下 JSON 格式（不要加 markdown 代碼塊標記）：
{
  "start_time": "完整日期時間（ISO 格式，如 2025-08-01T07:32:00）",
  "end_time": "完整日期時間（ISO 格式）",
  "total_distance": 0.0,
  "trip_count": 0,
  "locations": [
    {
      "segment": 1,
      "depart_time": "HH:mm",
      "arrive_time": "HH:mm",
      "from": "起點地名",
      "to": "終點地名",
      "distance_km": 0.0,
      "stay_minutes": 0
    }
  ]
}

注意：
- start_time 是當日首次開引擎時間
- end_time 是當日末次關引擎時間
- total_distance 是當日總里程（公里）
- trip_count 是行程段數
- locations 是每個行程段的詳情
- 行程段以引擎開關或長時間停留（>10分鐘）為分界
- 地名盡量使用具體地名（如堆填區名稱、工地名稱）`;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: [
        {
          role: 'system',
          content: '你是一個專業的 GPS 行程分析助手，專門分析香港建築運輸公司的車輛 GPS 追蹤資料。請根據 GPS 資料生成準確的每日行程摘要。',
        },
        { role: 'user', content: prompt },
      ],
      max_tokens: 4096,
      temperature: 0.1,
    });

    const content = response.choices[0]?.message?.content || '';

    try {
      let jsonStr = content.trim();
      if (jsonStr.startsWith('```json')) jsonStr = jsonStr.slice(7);
      else if (jsonStr.startsWith('```')) jsonStr = jsonStr.slice(3);
      if (jsonStr.endsWith('```')) jsonStr = jsonStr.slice(0, -3);
      jsonStr = jsonStr.trim();

      return JSON.parse(jsonStr);
    } catch {
      console.warn('[GpsService] Failed to parse AI response, using defaults');
      return {
        start_time: null,
        end_time: null,
        total_distance: 0,
        trip_count: 0,
        locations: [],
      };
    }
  }
}
