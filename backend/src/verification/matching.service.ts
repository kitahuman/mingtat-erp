import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from './whatsapp.service';

// ══════════════════════════════════════════════════════════════
// 六來源交叉比對服務（含欄位層級匹配評分）
// ══════════════════════════════════════════════════════════════

interface MatchingQuery {
  date_from: string;
  date_to: string;
  group_by: 'vehicle' | 'employee';
  search?: string;
  page?: number;
  limit?: number;
}

interface FieldScore {
  field: string;       // 欄位名稱
  weight: number;      // 權重 (0-1)
  score: number;       // 該欄位的匹配分數 (0-100)
  ref_value: string;   // 工作紀錄的參考值
  src_value: string;   // 來源的比對值
}

interface SourceData {
  source: string;
  status: 'found' | 'missing';
  match_score: number;        // 0-100 加權匹配百分比
  field_scores: FieldScore[]; // 各欄位的匹配明細
  details: any[];
}

export interface MatchingRow {
  key: string;
  date: string;
  sources: Record<string, SourceData>;
  match_status: 'full_match' | 'partial_match' | 'conflict' | 'missing_source';
  match_count: number;
  total_sources: number;
  avg_score: number;  // 所有 found 來源的平均 match_score
}

// ══════════════════════════════════════════════════════════════
// 欄位權重配置
// ══════════════════════════════════════════════════════════════
// 員工/司機 30%, 客戶 25%, 合約 25%, 地點 20%
const FIELD_WEIGHTS = {
  employee: 0.30,
  customer: 0.25,
  contract: 0.25,
  location: 0.20,
};

@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappService: WhatsappService,
  ) {}

  // ══════════════════════════════════════════════════════════════
  // 取得六來源交叉比對總覽
  // ══════════════════════════════════════════════════════════════
  async getMatchingOverview(query: MatchingQuery) {
    const {
      date_from,
      date_to,
      group_by,
      search,
      page = 1,
      limit = 50,
    } = query;

    const dateFrom = new Date(date_from);
    const dateTo = new Date(date_to);

    // 1. 取得工作紀錄 (work_logs) — 主軸
    const workLogs = await this.prisma.workLog.findMany({
      where: {
        scheduled_date: { gte: dateFrom, lte: dateTo },
        status: { not: 'cancelled' },
        ...(search
          ? {
              OR: [
                { equipment_number: { contains: search, mode: 'insensitive' as any } },
                { employee: { name_zh: { contains: search, mode: 'insensitive' as any } } },
                { employee: { nickname: { contains: search, mode: 'insensitive' as any } } },
              ],
            }
          : {}),
      },
      include: {
        employee: {
          select: { id: true, name_zh: true, name_en: true, nickname: true, emp_code: true },
        },
        client: { select: { id: true, name: true } },
        contract: { select: { id: true, contract_no: true } },
      },
      orderBy: [{ scheduled_date: 'asc' }, { id: 'asc' }],
    });

    // 2. 取得入帳票 (verification_records, source: receipt)
    const receiptSource = await this.prisma.verificationSource.findUnique({
      where: { source_code: 'receipt' },
    });
    const receiptRecords = receiptSource
      ? await this.prisma.verificationRecord.findMany({
          where: {
            record_source_id: receiptSource.id,
            record_work_date: { gte: dateFrom, lte: dateTo },
          },
          include: { chits: true },
        })
      : [];

    // 3. 取得飛仔 OCR (verification_records, source: slip_chit / slip_no_chit)
    const slipSources = await this.prisma.verificationSource.findMany({
      where: { source_code: { in: ['slip_chit', 'slip_no_chit'] } },
    });
    const slipSourceIds = slipSources.map((s) => s.id);
    const slipRecords = slipSourceIds.length > 0
      ? await this.prisma.verificationRecord.findMany({
          where: {
            record_source_id: { in: slipSourceIds },
            record_work_date: { gte: dateFrom, lte: dateTo },
          },
          include: { chits: true },
        })
      : [];

    // 4. 取得 GPS 追蹤 (verification_gps_summaries)
    const gpsSummaries = await this.prisma.verificationGpsSummary.findMany({
      where: {
        gps_summary_date: { gte: dateFrom, lte: dateTo },
      },
    });

    // 5. 取得打卡紀錄 (employee_attendances)
    const attendances = await this.prisma.employeeAttendance.findMany({
      where: {
        timestamp: { gte: dateFrom, lte: new Date(dateTo.getTime() + 86400000) },
      },
      include: {
        employee: {
          select: { id: true, name_zh: true, nickname: true, emp_code: true },
        },
      },
    });

    // 6. 取得 WhatsApp 每日總結 items
    const waOrderItems = await this.whatsappService.getDailySummaryItemsForMatching(dateFrom, dateTo);

    // ── 組裝比對結果 ──────────────────────────────────────────
    const results: MatchingRow[] = [];

    if (group_by === 'vehicle') {
      results.push(...this.matchByVehicle(workLogs, receiptRecords, slipRecords, gpsSummaries, attendances, waOrderItems));
    } else {
      results.push(...this.matchByEmployee(workLogs, receiptRecords, slipRecords, gpsSummaries, attendances, waOrderItems));
    }

    // 搜尋過濾
    let filtered = results;
    if (search) {
      const s = search.toLowerCase();
      filtered = results.filter(
        (r) => r.key.toLowerCase().includes(s) || r.date.includes(s),
      );
    }

    // 分頁
    const total = filtered.length;
    const paged = filtered.slice((page - 1) * limit, page * limit);

    // 統計
    const summary = {
      total,
      full_match: filtered.filter((r) => r.match_status === 'full_match').length,
      partial_match: filtered.filter((r) => r.match_status === 'partial_match').length,
      conflict: filtered.filter((r) => r.match_status === 'conflict').length,
      missing_source: filtered.filter((r) => r.match_status === 'missing_source').length,
    };

    return {
      summary,
      data: paged,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  // ══════════════════════════════════════════════════════════════
  // 按車牌分組比對
  // ══════════════════════════════════════════════════════════════
  private matchByVehicle(
    workLogs: any[],
    receiptRecords: any[],
    slipRecords: any[],
    gpsSummaries: any[],
    attendances: any[],
    waOrderItems: any[],
  ): MatchingRow[] {
    const groupMap = new Map<string, any[]>();
    for (const wl of workLogs) {
      if (!wl.equipment_number) continue;
      const date = wl.scheduled_date?.toISOString().slice(0, 10);
      if (!date) continue;
      const key = `${date}|${this.normalizeVehicle(wl.equipment_number)}`;
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push(wl);
    }

    const results: MatchingRow[] = [];

    for (const [groupKey, wls] of groupMap) {
      const [date, vehicleNorm] = groupKey.split('|');
      const vehicleDisplay = wls[0].equipment_number;

      // 工作紀錄參考值（取第一筆作為比對基準）
      const refWl = wls[0];
      const ref = {
        employee: refWl.employee?.name_zh || refWl.employee?.nickname || '',
        employeeNickname: refWl.employee?.nickname || '',
        customer: refWl.client?.name || refWl.unverified_client_name || '',
        contract: refWl.contract?.contract_no || refWl.client_contract_no || '',
        location: `${refWl.start_location || ''} ${refWl.end_location || ''}`.trim(),
      };

      const sources: Record<string, SourceData> = {};

      // 1. 工作紀錄（主軸，固定 100 分）
      sources['work_log'] = {
        source: '工作紀錄',
        status: 'found',
        match_score: 100,
        field_scores: [],
        details: wls.map((wl: any) => ({
          id: wl.id,
          date,
          vehicle: wl.equipment_number,
          employee: wl.employee?.name_zh || wl.employee?.nickname || '—',
          customer: wl.client?.name || wl.unverified_client_name || '—',
          contract: wl.contract?.contract_no || wl.client_contract_no || '—',
          location: `${wl.start_location || '—'} → ${wl.end_location || '—'}`,
          service_type: wl.service_type || '—',
          receipt_no: wl.receipt_no || '—',
        })),
      };

      // 2. 入帳票
      const matchedReceipts = receiptRecords.filter(
        (r: any) =>
          r.record_work_date?.toISOString().slice(0, 10) === date &&
          this.normalizeVehicle(r.record_vehicle_no) === vehicleNorm,
      );
      if (matchedReceipts.length > 0) {
        const bestReceipt = matchedReceipts[0];
        const fieldScores = this.computeFieldScores(ref, {
          employee: bestReceipt.record_driver_name || '',
          customer: bestReceipt.record_customer || '',
          contract: bestReceipt.record_contract_no || '',
          location: bestReceipt.record_location_from || '',
        });
        sources['chit'] = {
          source: '入帳票',
          status: 'found',
          match_score: this.weightedScore(fieldScores),
          field_scores: fieldScores,
          details: matchedReceipts.map((r: any) => ({
            id: r.id,
            vehicle: r.record_vehicle_no,
            employee: r.record_driver_name || '—',
            customer: r.record_customer || '—',
            location: r.record_location_from || '—',
            contract: r.record_contract_no || '—',
            chit_nos: r.chits?.map((c: any) => c.chit_no) || [],
            time_in: r.record_time_in,
            time_out: r.record_time_out,
            weight: r.record_weight_net,
          })),
        };
      } else {
        sources['chit'] = this.missingSource('入帳票');
      }

      // 3. 飛仔 OCR
      const matchedSlips = slipRecords.filter(
        (r: any) =>
          r.record_work_date?.toISOString().slice(0, 10) === date &&
          this.normalizeVehicle(r.record_vehicle_no) === vehicleNorm,
      );
      if (matchedSlips.length > 0) {
        const bestSlip = matchedSlips[0];
        const fieldScores = this.computeFieldScores(ref, {
          employee: bestSlip.record_driver_name || '',
          customer: bestSlip.record_customer || '',
          contract: bestSlip.record_contract_no || '',
          location: `${bestSlip.record_location_from || ''} ${bestSlip.record_location_to || ''}`.trim(),
        });
        sources['delivery_note'] = {
          source: '飛仔 OCR',
          status: 'found',
          match_score: this.weightedScore(fieldScores),
          field_scores: fieldScores,
          details: matchedSlips.map((r: any) => ({
            id: r.id,
            vehicle: r.record_vehicle_no,
            slip_no: r.record_slip_no || '—',
            employee: r.record_driver_name || '—',
            customer: r.record_customer || '—',
            location: `${r.record_location_from || '—'} → ${r.record_location_to || '—'}`,
            chit_nos: r.chits?.map((c: any) => c.chit_no) || [],
          })),
        };
      } else {
        sources['delivery_note'] = this.missingSource('飛仔 OCR');
      }

      // 4. GPS
      const matchedGps = gpsSummaries.filter(
        (g: any) =>
          g.gps_summary_date?.toISOString().slice(0, 10) === date &&
          this.normalizeVehicle(g.gps_summary_vehicle_no) === vehicleNorm,
      );
      if (matchedGps.length > 0) {
        const bestGps = matchedGps[0];
        // GPS 只有車牌和地點，沒有員工/客戶/合約
        const gpsLocations = bestGps.gps_summary_locations || '';
        const fieldScores: FieldScore[] = [
          { field: '員工/司機', weight: FIELD_WEIGHTS.employee, score: 0, ref_value: ref.employee, src_value: '—（GPS 無此欄位）' },
          { field: '客戶名稱', weight: FIELD_WEIGHTS.customer, score: 0, ref_value: ref.customer, src_value: '—（GPS 無此欄位）' },
          { field: '合約號碼', weight: FIELD_WEIGHTS.contract, score: 0, ref_value: ref.contract, src_value: '—（GPS 無此欄位）' },
          { field: '地點/路線', weight: FIELD_WEIGHTS.location, score: this.fuzzyMatch(ref.location, gpsLocations), ref_value: ref.location, src_value: gpsLocations || '—' },
        ];
        // GPS 特殊處理：只有地點可比對，所以只用地點的分數（不除以全部權重）
        const locationScore = fieldScores[3].score;
        sources['gps'] = {
          source: 'GPS 追蹤',
          status: 'found',
          match_score: locationScore,
          field_scores: fieldScores,
          details: matchedGps.map((g: any) => ({
            id: g.id,
            vehicle: g.gps_summary_vehicle_no,
            distance: g.gps_summary_total_distance,
            trip_count: g.gps_summary_trip_count,
            locations: g.gps_summary_locations,
            start_time: g.gps_summary_start_time,
            end_time: g.gps_summary_end_time,
          })),
        };
      } else {
        sources['gps'] = this.missingSource('GPS 追蹤');
      }

      // 5. 打卡
      const employeeIds = wls
        .map((wl: any) => wl.employee_id)
        .filter((id: any) => id != null);
      const matchedAttendances = attendances.filter(
        (a: any) =>
          employeeIds.includes(a.employee_id) &&
          a.timestamp?.toISOString().slice(0, 10) === date,
      );
      if (matchedAttendances.length > 0) {
        // 打卡是透過 employee_id 匹配的，員工一定吻合
        const fieldScores: FieldScore[] = [
          { field: '員工/司機', weight: FIELD_WEIGHTS.employee, score: 100, ref_value: ref.employee, src_value: matchedAttendances[0].employee?.name_zh || '—' },
          { field: '客戶名稱', weight: FIELD_WEIGHTS.customer, score: 0, ref_value: ref.customer, src_value: '—（打卡無此欄位）' },
          { field: '合約號碼', weight: FIELD_WEIGHTS.contract, score: 0, ref_value: ref.contract, src_value: '—（打卡無此欄位）' },
          { field: '地點/路線', weight: FIELD_WEIGHTS.location, score: this.fuzzyMatch(ref.location, matchedAttendances[0].address || ''), ref_value: ref.location, src_value: matchedAttendances[0].address || '—' },
        ];
        sources['attendance'] = {
          source: '打卡紀錄',
          status: 'found',
          match_score: this.weightedScore(fieldScores),
          field_scores: fieldScores,
          details: matchedAttendances.map((a: any) => ({
            id: a.id,
            employee: a.employee?.name_zh || '—',
            type: a.type,
            timestamp: a.timestamp,
            address: a.address || '—',
          })),
        };
      } else {
        sources['attendance'] = this.missingSource('打卡紀錄');
      }

      // 6. WhatsApp Order（同時比對 vehicle_no 和 machine_code）
      const matchedWa = waOrderItems.filter(
        (item: any) =>
          item.order_date === date &&
          (this.normalizeVehicle(item.wa_item_vehicle_no) === vehicleNorm ||
            this.normalizeVehicle(item.wa_item_machine_code) === vehicleNorm),
      );
      if (matchedWa.length > 0) {
        const bestWa = matchedWa[0];
        const fieldScores = this.computeFieldScores(ref, {
          employee: bestWa.wa_item_driver_nickname || '',
          customer: bestWa.wa_item_customer || '',
          contract: bestWa.wa_item_contract_no || '',
          location: bestWa.wa_item_location || '',
        });
        sources['whatsapp_order'] = {
          source: 'WhatsApp Order',
          status: 'found',
          match_score: this.weightedScore(fieldScores),
          field_scores: fieldScores,
          details: matchedWa.map((item: any) => ({
            id: item.id,
            vehicle: item.wa_item_vehicle_no || item.wa_item_machine_code || '—',
            employee: item.wa_item_driver_nickname || '—',
            customer: item.wa_item_customer || '—',
            contract: item.wa_item_contract_no || '—',
            location: item.wa_item_location || '—',
            work_desc: item.wa_item_work_desc || '—',
            is_suspended: item.wa_item_is_suspended,
            mod_status: item.wa_item_mod_status || null,
            order_status: item.order_status,
            order_version: item.order_version,
          })),
        };
      } else {
        sources['whatsapp_order'] = this.missingSource('WhatsApp Order');
      }

      // 計算匹配狀態（考慮 match_score）
      const { matchStatus, avgScore } = this.computeMatchStatus(sources);

      results.push({
        key: vehicleDisplay,
        date,
        sources,
        match_status: matchStatus,
        match_count: Object.values(sources).filter((s) => s.status === 'found').length,
        total_sources: 6,
        avg_score: avgScore,
      });
    }

    results.sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
    return results;
  }

  // ══════════════════════════════════════════════════════════════
  // 按員工分組比對
  // ══════════════════════════════════════════════════════════════
  private matchByEmployee(
    workLogs: any[],
    receiptRecords: any[],
    slipRecords: any[],
    gpsSummaries: any[],
    attendances: any[],
    waOrderItems: any[],
  ): MatchingRow[] {
    const groupMap = new Map<string, any[]>();
    for (const wl of workLogs) {
      if (!wl.employee_id) continue;
      const date = wl.scheduled_date?.toISOString().slice(0, 10);
      if (!date) continue;
      const key = `${date}|${wl.employee_id}`;
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push(wl);
    }

    const results: MatchingRow[] = [];

    for (const [groupKey, wls] of groupMap) {
      const [date, employeeIdStr] = groupKey.split('|');
      const employeeId = parseInt(employeeIdStr);
      const employee = wls[0].employee;
      const employeeName = employee?.name_zh || employee?.nickname || `ID:${employeeId}`;
      const employeeNickname = employee?.nickname || '';

      const refWl = wls[0];
      const ref = {
        employee: employeeName,
        employeeNickname,
        customer: refWl.client?.name || refWl.unverified_client_name || '',
        contract: refWl.contract?.contract_no || refWl.client_contract_no || '',
        location: `${refWl.start_location || ''} ${refWl.end_location || ''}`.trim(),
      };

      const vehicleNos = wls
        .map((wl: any) => wl.equipment_number)
        .filter(Boolean)
        .map((v: string) => this.normalizeVehicle(v));

      const sources: Record<string, SourceData> = {};

      // 1. 工作紀錄
      sources['work_log'] = {
        source: '工作紀錄',
        status: 'found',
        match_score: 100,
        field_scores: [],
        details: wls.map((wl: any) => ({
          id: wl.id,
          date,
          vehicle: wl.equipment_number || '—',
          employee: employeeName,
          customer: wl.client?.name || wl.unverified_client_name || '—',
          contract: wl.contract?.contract_no || wl.client_contract_no || '—',
          location: `${wl.start_location || '—'} → ${wl.end_location || '—'}`,
          service_type: wl.service_type || '—',
        })),
      };

      // 2. 入帳票
      const matchedReceipts = receiptRecords.filter(
        (r: any) =>
          r.record_work_date?.toISOString().slice(0, 10) === date &&
          vehicleNos.includes(this.normalizeVehicle(r.record_vehicle_no)),
      );
      if (matchedReceipts.length > 0) {
        const best = matchedReceipts[0];
        const fieldScores = this.computeFieldScores(ref, {
          employee: best.record_driver_name || '',
          customer: best.record_customer || '',
          contract: best.record_contract_no || '',
          location: best.record_location_from || '',
        });
        sources['chit'] = {
          source: '入帳票',
          status: 'found',
          match_score: this.weightedScore(fieldScores),
          field_scores: fieldScores,
          details: matchedReceipts.map((r: any) => ({
            id: r.id,
            vehicle: r.record_vehicle_no,
            employee: r.record_driver_name || '—',
            customer: r.record_customer || '—',
            location: r.record_location_from || '—',
            contract: r.record_contract_no || '—',
            chit_nos: r.chits?.map((c: any) => c.chit_no) || [],
          })),
        };
      } else {
        sources['chit'] = this.missingSource('入帳票');
      }

      // 3. 飛仔 OCR
      const matchedSlips = slipRecords.filter(
        (r: any) =>
          r.record_work_date?.toISOString().slice(0, 10) === date &&
          (vehicleNos.includes(this.normalizeVehicle(r.record_vehicle_no)) ||
            this.nameMatch(r.record_driver_name, employeeName, employeeNickname)),
      );
      if (matchedSlips.length > 0) {
        const best = matchedSlips[0];
        const fieldScores = this.computeFieldScores(ref, {
          employee: best.record_driver_name || '',
          customer: best.record_customer || '',
          contract: best.record_contract_no || '',
          location: `${best.record_location_from || ''} ${best.record_location_to || ''}`.trim(),
        });
        sources['delivery_note'] = {
          source: '飛仔 OCR',
          status: 'found',
          match_score: this.weightedScore(fieldScores),
          field_scores: fieldScores,
          details: matchedSlips.map((r: any) => ({
            id: r.id,
            vehicle: r.record_vehicle_no,
            slip_no: r.record_slip_no || '—',
            employee: r.record_driver_name || '—',
          })),
        };
      } else {
        sources['delivery_note'] = this.missingSource('飛仔 OCR');
      }

      // 4. GPS
      const matchedGps = gpsSummaries.filter(
        (g: any) =>
          g.gps_summary_date?.toISOString().slice(0, 10) === date &&
          vehicleNos.includes(this.normalizeVehicle(g.gps_summary_vehicle_no)),
      );
      if (matchedGps.length > 0) {
        const bestGps = matchedGps[0];
        const gpsLocations = bestGps.gps_summary_locations || '';
        const fieldScores: FieldScore[] = [
          { field: '員工/司機', weight: FIELD_WEIGHTS.employee, score: 0, ref_value: ref.employee, src_value: '—（GPS 無此欄位）' },
          { field: '客戶名稱', weight: FIELD_WEIGHTS.customer, score: 0, ref_value: ref.customer, src_value: '—（GPS 無此欄位）' },
          { field: '合約號碼', weight: FIELD_WEIGHTS.contract, score: 0, ref_value: ref.contract, src_value: '—（GPS 無此欄位）' },
          { field: '地點/路線', weight: FIELD_WEIGHTS.location, score: this.fuzzyMatch(ref.location, gpsLocations), ref_value: ref.location, src_value: gpsLocations || '—' },
        ];
        sources['gps'] = {
          source: 'GPS 追蹤',
          status: 'found',
          match_score: fieldScores[3].score,
          field_scores: fieldScores,
          details: matchedGps.map((g: any) => ({
            id: g.id,
            vehicle: g.gps_summary_vehicle_no,
            distance: g.gps_summary_total_distance,
            trip_count: g.gps_summary_trip_count,
          })),
        };
      } else {
        sources['gps'] = this.missingSource('GPS 追蹤');
      }

      // 5. 打卡
      const matchedAttendances = attendances.filter(
        (a: any) =>
          a.employee_id === employeeId &&
          a.timestamp?.toISOString().slice(0, 10) === date,
      );
      if (matchedAttendances.length > 0) {
        const fieldScores: FieldScore[] = [
          { field: '員工/司機', weight: FIELD_WEIGHTS.employee, score: 100, ref_value: ref.employee, src_value: matchedAttendances[0].employee?.name_zh || '—' },
          { field: '客戶名稱', weight: FIELD_WEIGHTS.customer, score: 0, ref_value: ref.customer, src_value: '—（打卡無此欄位）' },
          { field: '合約號碼', weight: FIELD_WEIGHTS.contract, score: 0, ref_value: ref.contract, src_value: '—（打卡無此欄位）' },
          { field: '地點/路線', weight: FIELD_WEIGHTS.location, score: this.fuzzyMatch(ref.location, matchedAttendances[0].address || ''), ref_value: ref.location, src_value: matchedAttendances[0].address || '—' },
        ];
        sources['attendance'] = {
          source: '打卡紀錄',
          status: 'found',
          match_score: this.weightedScore(fieldScores),
          field_scores: fieldScores,
          details: matchedAttendances.map((a: any) => ({
            id: a.id,
            employee: a.employee?.name_zh || '—',
            type: a.type,
            timestamp: a.timestamp,
            address: a.address || '—',
          })),
        };
      } else {
        sources['attendance'] = this.missingSource('打卡紀錄');
      }

      // 6. WhatsApp Order
      const matchedWa = waOrderItems.filter(
        (item: any) =>
          item.order_date === date &&
          (vehicleNos.includes(this.normalizeVehicle(item.wa_item_vehicle_no)) ||
            vehicleNos.includes(this.normalizeVehicle(item.wa_item_machine_code)) ||
            this.nameMatch(item.wa_item_driver_nickname, employeeName, employeeNickname)),
      );
      if (matchedWa.length > 0) {
        const bestWa = matchedWa[0];
        const fieldScores = this.computeFieldScores(ref, {
          employee: bestWa.wa_item_driver_nickname || '',
          customer: bestWa.wa_item_customer || '',
          contract: bestWa.wa_item_contract_no || '',
          location: bestWa.wa_item_location || '',
        });
        sources['whatsapp_order'] = {
          source: 'WhatsApp Order',
          status: 'found',
          match_score: this.weightedScore(fieldScores),
          field_scores: fieldScores,
          details: matchedWa.map((item: any) => ({
            id: item.id,
            vehicle: item.wa_item_vehicle_no || item.wa_item_machine_code || '—',
            employee: item.wa_item_driver_nickname || '—',
            customer: item.wa_item_customer || '—',
            contract: item.wa_item_contract_no || '—',
            is_suspended: item.wa_item_is_suspended,
            mod_status: item.wa_item_mod_status || null,
          })),
        };
      } else {
        sources['whatsapp_order'] = this.missingSource('WhatsApp Order');
      }

      const { matchStatus, avgScore } = this.computeMatchStatus(sources);

      results.push({
        key: employeeName,
        date,
        sources,
        match_status: matchStatus,
        match_count: Object.values(sources).filter((s) => s.status === 'found').length,
        total_sources: 6,
        avg_score: avgScore,
      });
    }

    results.sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
    return results;
  }

  // ══════════════════════════════════════════════════════════════
  // 評分工具方法
  // ══════════════════════════════════════════════════════════════

  /**
   * 計算四個欄位的匹配分數
   */
  private computeFieldScores(
    ref: { employee: string; employeeNickname?: string; customer: string; contract: string; location: string },
    src: { employee: string; customer: string; contract: string; location: string },
  ): FieldScore[] {
    return [
      {
        field: '員工/司機',
        weight: FIELD_WEIGHTS.employee,
        score: this.employeeMatch(ref.employee, ref.employeeNickname || '', src.employee),
        ref_value: ref.employee || '—',
        src_value: src.employee || '—',
      },
      {
        field: '客戶名稱',
        weight: FIELD_WEIGHTS.customer,
        score: this.fuzzyMatch(ref.customer, src.customer),
        ref_value: ref.customer || '—',
        src_value: src.customer || '—',
      },
      {
        field: '合約號碼',
        weight: FIELD_WEIGHTS.contract,
        score: this.contractMatch(ref.contract, src.contract),
        ref_value: ref.contract || '—',
        src_value: src.contract || '—',
      },
      {
        field: '地點/路線',
        weight: FIELD_WEIGHTS.location,
        score: this.fuzzyMatch(ref.location, src.location),
        ref_value: ref.location || '—',
        src_value: src.location || '—',
      },
    ];
  }

  /**
   * 加權計算總分
   */
  private weightedScore(fieldScores: FieldScore[]): number {
    // 只計算有資料的欄位（排除「無此欄位」的情況）
    const validFields = fieldScores.filter(
      (f) => !f.src_value.includes('無此欄位'),
    );
    if (validFields.length === 0) return 0;

    // 重新分配權重（讓有資料的欄位權重加起來 = 1）
    const totalWeight = validFields.reduce((sum, f) => sum + f.weight, 0);
    if (totalWeight === 0) return 0;

    const score = validFields.reduce(
      (sum, f) => sum + (f.score * f.weight) / totalWeight,
      0,
    );
    return Math.round(score);
  }

  /**
   * 員工/司機匹配（支援花名、全名、暱稱）
   */
  private employeeMatch(refName: string, refNickname: string, srcName: string): number {
    if (!refName || !srcName) return 0;

    const r = refName.trim().toLowerCase();
    const rn = refNickname.trim().toLowerCase();
    const s = srcName.trim().toLowerCase();
    if (!r || !s) return 0;

    // 完全匹配
    if (r === s || rn === s) return 100;

    // 去除常見前綴後匹配
    const prefixes = ['阿', '肥', '老', '大', '細', '小'];
    const stripPrefix = (name: string) => {
      for (const p of prefixes) {
        if (name.startsWith(p) && name.length > 1) return name.slice(1);
      }
      return name;
    };
    const rStripped = stripPrefix(r);
    const rnStripped = stripPrefix(rn);
    const sStripped = stripPrefix(s);

    if (rStripped === sStripped || rnStripped === sStripped) return 90;

    // 包含關係
    if (r.includes(s) || s.includes(r)) return 80;
    if (rn && (rn.includes(s) || s.includes(rn))) return 80;
    if (rStripped.includes(sStripped) || sStripped.includes(rStripped)) return 70;
    if (rnStripped && (rnStripped.includes(sStripped) || sStripped.includes(rnStripped))) return 70;

    // 單字匹配（如「文」vs「黃文麟」）
    if (s.length === 1 && (r.includes(s) || rn.includes(s))) return 60;
    if (r.length === 1 && s.includes(r)) return 60;

    return 0;
  }

  /**
   * 合約號碼匹配（精確為主，部分匹配為輔）
   */
  private contractMatch(ref: string, src: string): number {
    if (!ref || !src) return 0;
    const r = ref.trim().toUpperCase().replace(/[\s\-]/g, '');
    const s = src.trim().toUpperCase().replace(/[\s\-]/g, '');
    if (!r || !s) return 0;

    // 完全匹配
    if (r === s) return 100;

    // 一方包含另一方（如 "3802" vs "PA3802"）
    if (r.includes(s) || s.includes(r)) return 70;

    return 0;
  }

  /**
   * 模糊匹配（客戶名稱、地點）
   */
  private fuzzyMatch(ref: string, src: string): number {
    if (!ref || !src) return 0;
    const r = ref.trim().toLowerCase().replace(/[\s,，、]/g, '');
    const s = src.trim().toLowerCase().replace(/[\s,，、]/g, '');
    if (!r || !s || r === '—' || s === '—') return 0;

    // 完全匹配
    if (r === s) return 100;

    // 包含關係
    if (r.includes(s) || s.includes(r)) return 80;

    // 計算共同字元比例（簡易 Jaccard-like）
    const rChars = new Set(r);
    const sChars = new Set(s);
    const intersection = [...rChars].filter((c) => sChars.has(c)).length;
    const union = new Set([...rChars, ...sChars]).size;
    const similarity = union > 0 ? (intersection / union) * 100 : 0;

    if (similarity >= 50) return Math.round(similarity);

    return 0;
  }

  /**
   * 計算整體匹配狀態
   */
  private computeMatchStatus(sources: Record<string, SourceData>): {
    matchStatus: MatchingRow['match_status'];
    avgScore: number;
  } {
    const nonWorkSources = ['chit', 'delivery_note', 'gps', 'attendance', 'whatsapp_order'];
    const foundSources = nonWorkSources.filter((s) => sources[s]?.status === 'found');
    const foundCount = foundSources.length;

    // 計算平均分數（只計算 found 的來源）
    const avgScore = foundCount > 0
      ? Math.round(foundSources.reduce((sum, s) => sum + (sources[s]?.match_score || 0), 0) / foundCount)
      : 0;

    let matchStatus: MatchingRow['match_status'];

    if (foundCount === 0) {
      matchStatus = 'missing_source';
    } else if (foundCount >= 4 && avgScore >= 60) {
      matchStatus = 'full_match';
    } else if (foundCount >= 2 && avgScore >= 40) {
      matchStatus = 'partial_match';
    } else if (foundCount >= 2 && avgScore < 40) {
      matchStatus = 'conflict';
    } else {
      matchStatus = 'missing_source';
    }

    return { matchStatus, avgScore };
  }

  /**
   * 建立 missing source 物件
   */
  private missingSource(sourceName: string): SourceData {
    return {
      source: sourceName,
      status: 'missing',
      match_score: 0,
      field_scores: [],
      details: [],
    };
  }

  // ══════════════════════════════════════════════════════════════
  // 基礎工具方法
  // ══════════════════════════════════════════════════════════════

  private normalizeVehicle(plate: string | null | undefined): string {
    if (!plate) return '';
    return plate.toUpperCase().replace(/[\s\-]/g, '');
  }

  private nameMatch(
    name1: string | null | undefined,
    name2: string,
    nickname: string,
  ): boolean {
    if (!name1) return false;
    const n1 = name1.trim().toLowerCase();
    if (!n1) return false;
    if (name2 && name2.toLowerCase().includes(n1)) return true;
    if (nickname && nickname.toLowerCase().includes(n1)) return true;
    if (name2 && n1.includes(name2.toLowerCase())) return true;
    if (nickname && n1.includes(nickname.toLowerCase())) return true;
    return false;
  }
}
