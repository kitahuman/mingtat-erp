import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from './whatsapp.service';
import { NicknameMatchService } from './nickname-match.service';

// ══════════════════════════════════════════════════════════════
// 六來源交叉比對服務（含欄位層級匹配評分）
// ══════════════════════════════════════════════════════════════

interface MatchingQuery {
  date_from: string;
  date_to: string;
  group_by: 'vehicle' | 'employee';
  search?: string;
  review_status?: 'all' | 'unreviewed' | 'confirmed' | 'rejected' | 'manual_match';
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
  work_log_ids: number[];
  sources: Record<string, SourceData>;
  confirmations: Record<string, any>; // source_code → confirmation record
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
    private readonly nicknameMatchService: NicknameMatchService,
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
      review_status = 'all',
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

    // 7a. 取得街車司機花名索引（plate_norm → nicknames[]）
    const fleetDrivers = await this.prisma.subcontractorFleetDriver.findMany({
      where: { status: 'active', short_name: { not: null } },
      select: { plate_no: true, short_name: true },
    });
    const fleetNicknameMap = new Map<string, string[]>();
    for (const d of fleetDrivers) {
      if (!d.plate_no || !d.short_name) continue;
      const plateNorm = this.normalizeVehicle(d.plate_no);
      const nicknames = d.short_name.split(/[,，]/).map((n: string) => n.trim()).filter(Boolean);
      if (nicknames.length > 0) {
        const existing = fleetNicknameMap.get(plateNorm) || [];
        fleetNicknameMap.set(plateNorm, [...existing, ...nicknames]);
      }
    }

    // 7b. 預先查詢所有員工的 emp_nicknames（employeeId → 別名陣列）
    const allEmployeeIds = [...new Set(
      workLogs.map((wl: { employee_id: number | null }) => wl.employee_id).filter((id): id is number => id != null),
    )];
    const empNicknameRows = allEmployeeIds.length > 0
      ? await this.prisma.employeeNickname.findMany({
          where: { emp_nickname_employee_id: { in: allEmployeeIds } },
          select: { emp_nickname_employee_id: true, emp_nickname_value: true },
        })
      : [];
    const empNicknameMap = new Map<number, string[]>();
    for (const row of empNicknameRows) {
      const existing = empNicknameMap.get(row.emp_nickname_employee_id) || [];
      existing.push(row.emp_nickname_value);
      empNicknameMap.set(row.emp_nickname_employee_id, existing);
    }

    // 7c. 預先查詢 field_options 地點別名（label → aliases[]）
    const locationOptions = await this.prisma.fieldOption.findMany({
      where: { category: 'location', is_active: true },
      select: { label: true, aliases: true },
    });
    const locationAliasMap = new Map<string, string[]>();
    for (const opt of locationOptions) {
      const label = opt.label;
      const aliases = Array.isArray(opt.aliases)
        ? (opt.aliases as string[])
        : [];
      if (label) {
        locationAliasMap.set(label, aliases);
      }
    }

    // ── 組裝比對結果 ──────────────────────────────────────────
    const results: MatchingRow[] = [];

    if (group_by === 'vehicle') {
      results.push(...this.matchByVehicle(workLogs, receiptRecords, slipRecords, gpsSummaries, attendances, waOrderItems, fleetNicknameMap, empNicknameMap, locationAliasMap));
    } else {
      results.push(...this.matchByEmployee(workLogs, receiptRecords, slipRecords, gpsSummaries, attendances, waOrderItems, empNicknameMap, locationAliasMap));
    }

    // 7. 載入確認狀態
    const allWorkLogIds = results.flatMap((r) => r.work_log_ids);
    const confirmations = allWorkLogIds.length > 0
      ? await this.prisma.verificationConfirmation.findMany({
          where: { work_log_id: { in: allWorkLogIds } },
          include: { user: { select: { id: true, displayName: true, username: true } } },
        })
      : [];

    // 按 work_log_id 分組確認記錄
    const confirmMap = new Map<number, any[]>();
    for (const c of confirmations) {
      if (!confirmMap.has(c.work_log_id)) confirmMap.set(c.work_log_id, []);
      confirmMap.get(c.work_log_id)!.push(c);
    }

    // confirmation source_code → sources key 映射
    // (confirmation 表用 receipt/slip_chit/slip_no_chit/gps/clock/whatsapp_order，
    //  sources 物件用 chit/delivery_note/gps/attendance/whatsapp_order)
    const confirmSourceToRowSource: Record<string, string> = {
      receipt: 'chit',
      slip_chit: 'delivery_note',
      slip_no_chit: 'delivery_note',
      gps: 'gps',
      clock: 'attendance',
      whatsapp_order: 'whatsapp_order',
    };

    // 附加確認狀態到每一行，並把手動配對/確認回饋到 sources，重新計算 match_status

    // 預先收集所有 whatsapp_order 手動配對的 matched_record_id，批量查詢 wa_order_item
    const waManualMatchIds: number[] = [];
    for (const [, cs] of confirmMap) {
      for (const c of cs) {
        if (c.source_code === 'whatsapp_order' && c.status === 'manual_match' && c.matched_record_id) {
          waManualMatchIds.push(c.matched_record_id);
        }
      }
    }
    const waManualItemsMap = new Map<number, any>();
    if (waManualMatchIds.length > 0) {
      const waManualItems = await this.prisma.verificationWaOrderItem.findMany({
        where: { id: { in: waManualMatchIds } },
        include: {
          order: {
            select: { wa_order_date: true, wa_order_status: true, wa_order_version: true },
          },
        },
      });
      for (const item of waManualItems) {
        waManualItemsMap.set(item.id, {
          ...item,
          order_date: item.order?.wa_order_date?.toISOString().slice(0, 10),
          order_status: item.order?.wa_order_status,
          order_version: item.order?.wa_order_version,
        });
      }
    }

    for (const row of results) {
      const rowConfirms: Record<string, any> = {};
      let needRecompute = false;

      for (const wlId of row.work_log_ids) {
        const cs = confirmMap.get(wlId) || [];
        for (const c of cs) {
          rowConfirms[c.source_code] = {
            id: c.id,
            status: c.status,
            matched_record_id: c.matched_record_id,
            matched_record_type: c.matched_record_type,
            notes: c.notes,
            confirmed_by: c.user?.displayName || c.user?.username || '—',
            confirmed_at: c.confirmed_at,
          };

          const rowSourceKey = confirmSourceToRowSource[c.source_code];
          if (rowSourceKey) {
            if (c.status === 'manual_match' && c.source_code === 'whatsapp_order' && c.matched_record_id) {
              // WhatsApp 手動配對優先：用手動配對的 item 替換 details
              const manualItem = waManualItemsMap.get(c.matched_record_id);
              if (manualItem) {
                row.sources['whatsapp_order'] = {
                  source: 'WhatsApp Order',
                  status: 'found',
                  match_score: 100,
                  field_scores: [],
                  details: [{
                    id: manualItem.id,
                    vehicle: manualItem.wa_item_vehicle_no || manualItem.wa_item_machine_code || '—',
                    employee: manualItem.wa_item_driver_nickname || '—',
                    customer: manualItem.wa_item_customer || '—',
                    contract: manualItem.wa_item_contract_no || '—',
                    location: manualItem.wa_item_location || '—',
                    work_desc: manualItem.wa_item_work_desc || '—',
                    product_name: manualItem.wa_item_product_name || null,
                    product_unit: manualItem.wa_item_product_unit || null,
                    goods_quantity: manualItem.wa_item_goods_quantity !== null ? Number(manualItem.wa_item_goods_quantity) : null,
                    is_suspended: manualItem.wa_item_is_suspended,
                    mod_status: manualItem.wa_item_mod_status || null,
                    order_status: manualItem.order_status,
                    order_version: manualItem.order_version,
                  }],
                };
                needRecompute = true;
              }
            } else if (
              (c.status === 'manual_match' || c.status === 'confirmed') &&
              row.sources[rowSourceKey]?.status === 'missing'
            ) {
              // 其他來源：手動確認時將 missing 改為 found
              row.sources[rowSourceKey].status = 'found';
              row.sources[rowSourceKey].match_score = 100;
              needRecompute = true;
            }
          }
        }
      }
      row.confirmations = rowConfirms;

      // 重新計算 match_status / match_count / avg_score
      if (needRecompute) {
        const { matchStatus, avgScore } = this.computeMatchStatus(row.sources);
        row.match_status = matchStatus;
        row.match_count = Object.values(row.sources).filter((s) => (s as any).status === 'found').length;
        row.avg_score = avgScore;
      }
    }

    // 搜尋過濾
    let filtered = results;
    if (search) {
      const s = search.toLowerCase();
      filtered = results.filter(
        (r) => r.key.toLowerCase().includes(s) || r.date.includes(s),
      );
    }

    // 審核狀態過濾
    if (review_status && review_status !== 'all') {
      filtered = filtered.filter((row) => {
        const sourceKeys = ['chit', 'delivery_note', 'gps', 'attendance', 'whatsapp_order'];
        if (review_status === 'unreviewed') {
          // 至少有一個來源沒有確認記錄
          return sourceKeys.some((k) => !row.confirmations[k]);
        }
        // confirmed / rejected / manual_match：至少有一個來源是該狀態
        return sourceKeys.some((k) => row.confirmations[k]?.status === review_status);
      });
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
    fleetNicknameMap: Map<string, string[]> = new Map(),
    empNicknameMap: Map<number, string[]> = new Map(),
    locationAliasMap: Map<string, string[]> = new Map(),
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
      const refEmployeeId: number | null = refWl.employee_id ?? null;
      const refEmpNicknames: string[] = refEmployeeId != null
        ? (empNicknameMap.get(refEmployeeId) || [])
        : [];
      const ref = {
        employee: refWl.employee?.name_zh || refWl.employee?.nickname || '',
        employeeNickname: refWl.employee?.nickname || '',
        empNicknames: refEmpNicknames,
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
        }, locationAliasMap);
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
        }, locationAliasMap);
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
          { field: '地點/路線', weight: FIELD_WEIGHTS.location, score: this.fuzzyMatchWithAliases(ref.location, gpsLocations, locationAliasMap), ref_value: ref.location, src_value: gpsLocations || '—' },
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
          { field: '地點/路線', weight: FIELD_WEIGHTS.location, score: this.fuzzyMatchWithAliases(ref.location, matchedAttendances[0].address || '', locationAliasMap), ref_value: ref.location, src_value: matchedAttendances[0].address || '—' },
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
      // 街車司機花名（用於比對 wa_item_driver_nickname）
      const fleetNicknames = fleetNicknameMap.get(vehicleNorm) || [];
      const matchedWa = waOrderItems.filter(
        (item: any) =>
          item.order_date === date &&
          (this.normalizeVehicle(item.wa_item_vehicle_no) === vehicleNorm ||
            this.normalizeVehicle(item.wa_item_machine_code) === vehicleNorm ||
            (fleetNicknames.length > 0 && fleetNicknames.some(nick =>
              this.nameMatch(item.wa_item_driver_nickname, nick, nick)))),
      );
      if (matchedWa.length > 0) {
        const bestWa = matchedWa[0];
        const fieldScores = this.computeFieldScores(ref, {
          employee: bestWa.wa_item_driver_nickname || '',
          customer: bestWa.wa_item_customer || '',
          contract: bestWa.wa_item_contract_no || '',
          location: bestWa.wa_item_location || '',
        }, locationAliasMap);
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
            product_name: item.wa_item_product_name || null,
            product_unit: item.wa_item_product_unit || null,
            goods_quantity: item.wa_item_goods_quantity !== null ? Number(item.wa_item_goods_quantity) : null,
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
        work_log_ids: wls.map((wl: any) => wl.id),
        sources,
        confirmations: {},
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
    empNicknameMap: Map<number, string[]> = new Map(),
    locationAliasMap: Map<string, string[]> = new Map(),
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
      const refEmpNicknames: string[] = empNicknameMap.get(employeeId) || [];
      const ref = {
        employee: employeeName,
        employeeNickname,
        empNicknames: refEmpNicknames,
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
        }, locationAliasMap);
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
            this.nameMatch(r.record_driver_name, employeeName, employeeNickname) ||
            refEmpNicknames.some((nick) => this.nameMatch(r.record_driver_name, nick, nick))),
      );
      if (matchedSlips.length > 0) {
        const best = matchedSlips[0];
        const fieldScores = this.computeFieldScores(ref, {
          employee: best.record_driver_name || '',
          customer: best.record_customer || '',
          contract: best.record_contract_no || '',
          location: `${best.record_location_from || ''} ${best.record_location_to || ''}`.trim(),
        }, locationAliasMap);
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
          { field: '地點/路線', weight: FIELD_WEIGHTS.location, score: this.fuzzyMatchWithAliases(ref.location, gpsLocations, locationAliasMap), ref_value: ref.location, src_value: gpsLocations || '—' },
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
          { field: '地點/路線', weight: FIELD_WEIGHTS.location, score: this.fuzzyMatchWithAliases(ref.location, matchedAttendances[0].address || '', locationAliasMap), ref_value: ref.location, src_value: matchedAttendances[0].address || '—' },
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
      // 除了車牌和主昵名比對，也檢查 emp_nicknames 別名
      const matchedWa = waOrderItems.filter(
        (item: any) =>
          item.order_date === date &&
          (vehicleNos.includes(this.normalizeVehicle(item.wa_item_vehicle_no)) ||
            vehicleNos.includes(this.normalizeVehicle(item.wa_item_machine_code)) ||
            this.nameMatch(item.wa_item_driver_nickname, employeeName, employeeNickname) ||
            refEmpNicknames.some((nick) => this.nameMatch(item.wa_item_driver_nickname, nick, nick))),
      );
      if (matchedWa.length > 0) {
        const bestWa = matchedWa[0];
        const fieldScores = this.computeFieldScores(ref, {
          employee: bestWa.wa_item_driver_nickname || '',
          customer: bestWa.wa_item_customer || '',
          contract: bestWa.wa_item_contract_no || '',
          location: bestWa.wa_item_location || '',
        }, locationAliasMap);
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
            product_name: item.wa_item_product_name || null,
            product_unit: item.wa_item_product_unit || null,
            goods_quantity: item.wa_item_goods_quantity !== null ? Number(item.wa_item_goods_quantity) : null,
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
        work_log_ids: wls.map((wl: any) => wl.id),
        sources,
        confirmations: {},
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
   * @param ref 工作紀錄參考值（可包含 empNicknames 別名陣列和 locationAliasMap）
   * @param src 來源比對值
   * @param locationAliasMap 地點別名對映（可選）
   */
  private computeFieldScores(
    ref: { employee: string; employeeNickname?: string; empNicknames?: string[]; customer: string; contract: string; location: string },
    src: { employee: string; customer: string; contract: string; location: string },
    locationAliasMap: Map<string, string[]> = new Map(),
  ): FieldScore[] {
    return [
      {
        field: '員工/司機',
        weight: FIELD_WEIGHTS.employee,
        score: this.employeeMatchWithNicknames(ref.employee, ref.employeeNickname || '', ref.empNicknames || [], src.employee),
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
        score: this.fuzzyMatchWithAliases(ref.location, src.location, locationAliasMap),
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
  private employeeMatch(refName: unknown, refNickname: unknown, srcName: unknown): number {
    const refNameStr = (refName == null) ? '' : String(refName);
    const refNicknameStr = (refNickname == null) ? '' : String(refNickname);
    const srcNameStr = (srcName == null) ? '' : String(srcName);
    if (!refNameStr || !srcNameStr) return 0;

    const r = refNameStr.trim().toLowerCase();
    const rn = refNicknameStr.trim().toLowerCase();
    const s = srcNameStr.trim().toLowerCase();
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
  private contractMatch(ref: unknown, src: unknown): number {
    if (ref == null || src == null || ref === '' || src === '') return 0;
    const r = String(ref).trim().toUpperCase().replace(/[\s\-]/g, '');
    const s = String(src).trim().toUpperCase().replace(/[\s\-]/g, '');
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
  private fuzzyMatch(ref: unknown, src: unknown): number {
    // Guard: convert non-string / null / undefined to string safely
    const refStr = (ref == null || ref === '') ? '' : String(ref).trim().toLowerCase().replace(/[\s,，、]/g, '');
    const srcStr = (src == null || src === '') ? '' : String(src).trim().toLowerCase().replace(/[\s,，、]/g, '');
    if (!refStr || !srcStr || refStr === '—' || srcStr === '—') return 0;
    const r = refStr;
    const s = srcStr;

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
   * 員工/司機匹配（支援花名、全名、暴稱，以及 emp_nicknames 別名陣列）
   * 在原有 employeeMatch 基礎上，額外檢查 emp_nicknames 表的所有別名
   */
  private employeeMatchWithNicknames(
    refName: unknown,
    refNickname: unknown,
    empNicknames: string[],
    srcName: unknown,
  ): number {
    // 先用原有邏輯比對主名和暴稱
    const baseScore = this.employeeMatch(refName, refNickname, srcName);
    if (baseScore > 0) return baseScore;

    // 再用 emp_nicknames 別名陣列逐一比對
    if (empNicknames.length === 0) return 0;
    const srcNameStr = (srcName == null) ? '' : String(srcName).trim();
    if (!srcNameStr) return 0;

    let bestScore = 0;
    for (const nick of empNicknames) {
      const score = this.employeeMatch(nick, '', srcNameStr);
      if (score > bestScore) bestScore = score;
    }
    return bestScore;
  }

  /**
   * 地點模糊匹配（包含 field_options aliases 別名比對）
   * 除了原有文字比對，如果 ref 或 src 在 locationAliasMap 中有對應的別名，也一並比對
   */
  private fuzzyMatchWithAliases(
    ref: unknown,
    src: unknown,
    locationAliasMap: Map<string, string[]>,
  ): number {
    // 先用原有文字比對
    const baseScore = this.fuzzyMatch(ref, src);
    if (baseScore >= 80) return baseScore; // 已是高分，不需要別名

    if (locationAliasMap.size === 0) return baseScore;

    const refStr = (ref == null || ref === '') ? '' : String(ref).trim();
    const srcStr = (src == null || src === '') ? '' : String(src).trim();
    if (!refStr || !srcStr) return baseScore;

    // 收集 ref 的全部候選名稱（原始文字 + 別名）
    const refCandidates = new Set<string>([refStr]);
    for (const [label, aliases] of locationAliasMap) {
      if (label === refStr || aliases.includes(refStr)) {
        refCandidates.add(label);
        for (const a of aliases) refCandidates.add(a);
      }
    }

    // 收集 src 的全部候選名稱（原始文字 + 別名）
    const srcCandidates = new Set<string>([srcStr]);
    for (const [label, aliases] of locationAliasMap) {
      if (label === srcStr || aliases.includes(srcStr)) {
        srcCandidates.add(label);
        for (const a of aliases) srcCandidates.add(a);
      }
    }

    // 對所有候選組合進行比對，取最高分
    let bestScore = baseScore;
    for (const r of refCandidates) {
      for (const s of srcCandidates) {
        if (r === refStr && s === srcStr) continue; // 已經計算過
        const score = this.fuzzyMatch(r, s);
        if (score > bestScore) bestScore = score;
      }
    }
    return bestScore;
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

  // ══════════════════════════════════════════════════════════════
  // 單筆工作紀錄核對（給工作紀錄頁面的展開面板使用）
  // ══════════════════════════════════════════════════════════════
  async matchSingle(workLogId: number) {
    // 1. 取得單筆工作紀錄
    const wl = await this.prisma.workLog.findUnique({
      where: { id: workLogId },
      include: {
        employee: { select: { id: true, name_zh: true, name_en: true, nickname: true, emp_code: true } },
        client: { select: { id: true, name: true } },
        contract: { select: { id: true, contract_no: true } },
      },
    });
    if (!wl) throw new Error(`WorkLog ${workLogId} not found`);

    const date = wl.scheduled_date?.toISOString().slice(0, 10);
    if (!date) return { work_log_id: workLogId, date: null, sources: {} };

    const dateObj = new Date(date);
    const vehicleNorm = this.normalizeVehicle(wl.equipment_number);
    const employeeId = wl.employee_id;

    // 2. 入帳票
    const receiptSource = await this.prisma.verificationSource.findUnique({ where: { source_code: 'receipt' } });
    const receiptRecords = receiptSource ? await this.prisma.verificationRecord.findMany({
      where: { record_source_id: receiptSource.id, record_work_date: dateObj },
      include: { chits: true },
    }) : [];

    // 3. 飛仔 OCR
    const slipSources = await this.prisma.verificationSource.findMany({ where: { source_code: { in: ['slip_chit', 'slip_no_chit'] } } });
    const slipSourceIds = slipSources.map((s) => s.id);
    const slipRecords = slipSourceIds.length > 0 ? await this.prisma.verificationRecord.findMany({
      where: { record_source_id: { in: slipSourceIds }, record_work_date: dateObj },
      include: { chits: true },
    }) : [];

    // 4. GPS
    const gpsSummaries = await this.prisma.verificationGpsSummary.findMany({
      where: { gps_summary_date: dateObj },
    });

    // 5. 打卡
    const attendances = await this.prisma.employeeAttendance.findMany({
      where: { timestamp: { gte: dateObj, lt: new Date(dateObj.getTime() + 86400000) } },
      include: { employee: { select: { id: true, name_zh: true, nickname: true } } },
    });

    // 6. WhatsApp
    const waOrderItems = await this.whatsappService.getDailySummaryItemsForMatching(dateObj, dateObj);

    const sources: Record<string, any> = {};

    // 工作紀錄本身
    sources['work_log'] = {
      source: '工作紀錄',
      status: 'found',
      details: [{
        id: wl.id,
        vehicle: wl.equipment_number || '—',
        employee: wl.employee?.name_zh || wl.employee?.nickname || '—',
        customer: wl.client?.name || wl.unverified_client_name || '—',
        contract: wl.contract?.contract_no || wl.client_contract_no || '—',
        location: [wl.start_location, wl.end_location].filter(Boolean).join(' → ') || '—',
        service_type: wl.service_type || '—',
      }],
    };

    // 入帳票
    const matchedReceipts = vehicleNorm
      ? receiptRecords.filter((r: any) => this.normalizeVehicle(r.record_vehicle_no) === vehicleNorm)
      : [];
    if (matchedReceipts.length > 0) {
      sources['chit'] = {
        source: '入帳票',
        status: 'found',
        details: matchedReceipts.map((r: any) => {
          const raw = r.record_raw_data as any || {};
          return {
            id: r.id,
            facility: raw.facility || '—',
            vehicle: r.record_vehicle_no || '—',
            account_no: raw.account_no || '—',
            chit_nos: r.chits?.map((c: any) => c.chit_no) || [],
            weight_net: r.record_weight_net ?? '—',
          };
        }),
      };
    } else {
      sources['chit'] = { source: '入帳票', status: 'missing', details: [] };
    }

    // 飛仔 OCR
    const matchedSlips = vehicleNorm
      ? slipRecords.filter((r: any) => this.normalizeVehicle(r.record_vehicle_no) === vehicleNorm)
      : [];
    if (matchedSlips.length > 0) {
      sources['delivery_note'] = {
        source: '飛仔 OCR',
        status: 'found',
        details: matchedSlips.map((r: any) => ({
          id: r.id,
          vehicle: r.record_vehicle_no || '—',
          slip_no: r.record_slip_no || '—',
          employee: r.record_driver_name || '—',
          customer: r.record_customer || '—',
          location: [r.record_location_from, r.record_location_to].filter(Boolean).join(' → ') || '—',
          chit_nos: r.chits?.map((c: any) => c.chit_no) || [],
        })),
      };
    } else {
      sources['delivery_note'] = { source: '飛仔 OCR', status: 'missing', details: [] };
    }

    // GPS
    const matchedGps = vehicleNorm
      ? gpsSummaries.filter((g: any) => this.normalizeVehicle(g.gps_summary_vehicle_no) === vehicleNorm)
      : [];
    if (matchedGps.length > 0) {
      sources['gps'] = {
        source: 'GPS 追蹤',
        status: 'found',
        details: matchedGps.map((g: any) => ({
          id: g.id,
          vehicle: g.gps_summary_vehicle_no || '—',
          distance: g.gps_summary_total_distance ?? '—',
          trip_count: g.gps_summary_trip_count ?? '—',
          locations: g.gps_summary_locations || '—',
          start_time: g.gps_summary_start_time || '—',
          end_time: g.gps_summary_end_time || '—',
        })),
      };
    } else {
      sources['gps'] = { source: 'GPS 追蹤', status: 'missing', details: [] };
    }

    // 打卡
    const matchedAttendances = employeeId
      ? attendances.filter((a: any) => a.employee_id === employeeId)
      : [];
    if (matchedAttendances.length > 0) {
      sources['attendance'] = {
        source: '打卡紀錄',
        status: 'found',
        details: matchedAttendances.map((a: any) => ({
          id: a.id,
          employee: a.employee?.name_zh || '—',
          type: a.type || '—',
          timestamp: a.timestamp,
          address: a.address || '—',
        })),
      };
    } else {
      sources['attendance'] = { source: '打卡紀錄', status: 'missing', details: [] };
    }

    // WhatsApp
    // 查詢街車司機花名（用於比對 wa_item_driver_nickname）
    let fleetNicknames: string[] = [];
    if (vehicleNorm) {
      const allFleetDrivers = await this.prisma.subcontractorFleetDriver.findMany({
        where: { status: 'active', short_name: { not: null } },
        select: { plate_no: true, short_name: true },
      });
      for (const d of allFleetDrivers) {
        if (d.plate_no && this.normalizeVehicle(d.plate_no) === vehicleNorm && d.short_name) {
          const nicks = d.short_name.split(/[,，]/).map((n: string) => n.trim()).filter(Boolean);
          fleetNicknames = [...fleetNicknames, ...nicks];
        }
      }
    }
    const matchedWa = vehicleNorm
      ? waOrderItems.filter((item: any) =>
          item.order_date === date &&
          (this.normalizeVehicle(item.wa_item_vehicle_no) === vehicleNorm ||
            this.normalizeVehicle(item.wa_item_machine_code) === vehicleNorm ||
            (fleetNicknames.length > 0 && fleetNicknames.some(nick =>
              this.nameMatch(item.wa_item_driver_nickname, nick, nick)))),
        )
      : [];

    // 檢查是否有手動配對記錄
    const waManualMatch = await this.prisma.verificationConfirmation.findUnique({
      where: { work_log_id_source_code: { work_log_id: workLogId, source_code: 'whatsapp_order' } },
    });
    if (waManualMatch && waManualMatch.status === 'manual_match' && waManualMatch.matched_record_id) {
      // 手動配對優先：直接用 matched_record_id 查 wa_order_item，並替換自動配對結果
      // 需要 include order 以取得 order_date / order_status / order_version
      const manualItem = await this.prisma.verificationWaOrderItem.findUnique({
        where: { id: waManualMatch.matched_record_id },
        include: {
          order: {
            select: { wa_order_date: true, wa_order_status: true, wa_order_version: true },
          },
        },
      });
      if (manualItem) {
        // 將 order 資訊展平到 item 上（與 getDailySummaryItemsForMatching 的格式一致）
        const flatItem = {
          ...manualItem,
          order_date: manualItem.order?.wa_order_date?.toISOString().slice(0, 10),
          order_status: manualItem.order?.wa_order_status,
          order_version: manualItem.order?.wa_order_version,
        };
        // 手動配對覆蓋自動配對：清空自動配對結果，只保留手動配對的 item
        matchedWa.length = 0;
        matchedWa.push(flatItem as any);
      }
    }

    if (matchedWa.length > 0) {
      sources['whatsapp_order'] = {
        source: 'WhatsApp Order',
        status: 'found',
        details: matchedWa.map((item: any) => ({
          id: item.id,
          vehicle: item.wa_item_vehicle_no || item.wa_item_machine_code || '—',
          employee: item.wa_item_driver_nickname || '—',
          customer: item.wa_item_customer || '—',
          contract: item.wa_item_contract_no || '—',
          location: item.wa_item_location || '—',
          work_desc: item.wa_item_work_desc || '—',
          product_name: item.wa_item_product_name || null,
          product_unit: item.wa_item_product_unit || null,
          goods_quantity: item.wa_item_goods_quantity !== null ? Number(item.wa_item_goods_quantity) : null,
          order_status: item.order_status || '—',
        })),
      };
    } else {
      sources['whatsapp_order'] = { source: 'WhatsApp Order', status: 'missing', details: [] };
    }

    return {
      work_log_id: workLogId,
      date,
      vehicle: wl.equipment_number,
      sources,
    };
  }
}
