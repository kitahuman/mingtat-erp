import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// ══════════════════════════════════════════════════════════════
// 六來源交叉比對服務
// ══════════════════════════════════════════════════════════════

interface MatchingQuery {
  date_from: string;
  date_to: string;
  group_by: 'vehicle' | 'employee';
  search?: string;
  page?: number;
  limit?: number;
}

interface SourceData {
  source: string;
  status: 'found' | 'missing';
  details: any[];
}

export interface MatchingRow {
  key: string; // vehicle_no or employee name
  date: string;
  sources: Record<string, SourceData>;
  match_status: 'full_match' | 'partial_match' | 'conflict' | 'missing_source';
  match_count: number;
  total_sources: number;
}

@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);

  constructor(private readonly prisma: PrismaService) {}

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

    // 6. 取得 WhatsApp Orders (verification_wa_order_items via orders)
    const waOrders = await this.prisma.verificationWaOrder.findMany({
      where: {
        wa_order_date: { gte: dateFrom, lte: dateTo },
      },
      include: {
        items: true,
      },
      orderBy: [{ wa_order_date: 'asc' }, { wa_order_version: 'desc' }],
    });

    // 只取每天最新版本的 order
    const latestWaOrdersByDate = new Map<string, typeof waOrders[0]>();
    for (const order of waOrders) {
      const dateKey = order.wa_order_date.toISOString().slice(0, 10);
      if (!latestWaOrdersByDate.has(dateKey) || order.wa_order_version > latestWaOrdersByDate.get(dateKey)!.wa_order_version) {
        latestWaOrdersByDate.set(dateKey, order);
      }
    }
    const waOrderItems = Array.from(latestWaOrdersByDate.values()).flatMap((o) =>
      o.items.map((item) => ({
        ...item,
        order_date: o.wa_order_date.toISOString().slice(0, 10),
        order_status: o.wa_order_status,
        order_version: o.wa_order_version,
      })),
    );

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
    // 按 date + vehicle 分組 work logs
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

      // 匹配各來源
      const sources: Record<string, SourceData> = {};

      // 1. 工作紀錄
      sources['work_log'] = {
        source: '工作紀錄',
        status: 'found',
        details: wls.map((wl: any) => ({
          id: wl.id,
          date,
          vehicle: wl.equipment_number,
          employee: wl.employee?.name_zh || wl.employee?.nickname || '—',
          customer: wl.client?.name || '—',
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
      sources['chit'] = {
        source: '入帳票',
        status: matchedReceipts.length > 0 ? 'found' : 'missing',
        details: matchedReceipts.map((r: any) => ({
          id: r.id,
          vehicle: r.record_vehicle_no,
          location: r.record_location_from || '—',
          contract: r.record_contract_no || '—',
          chit_nos: r.chits?.map((c: any) => c.chit_no) || [],
          time_in: r.record_time_in,
          time_out: r.record_time_out,
          weight: r.record_weight_net,
        })),
      };

      // 3. 飛仔 OCR
      const matchedSlips = slipRecords.filter(
        (r: any) =>
          r.record_work_date?.toISOString().slice(0, 10) === date &&
          this.normalizeVehicle(r.record_vehicle_no) === vehicleNorm,
      );
      sources['delivery_note'] = {
        source: '飛仔 OCR',
        status: matchedSlips.length > 0 ? 'found' : 'missing',
        details: matchedSlips.map((r: any) => ({
          id: r.id,
          vehicle: r.record_vehicle_no,
          slip_no: r.record_slip_no || '—',
          customer: r.record_customer || '—',
          location: `${r.record_location_from || '—'} → ${r.record_location_to || '—'}`,
          chit_nos: r.chits?.map((c: any) => c.chit_no) || [],
        })),
      };

      // 4. GPS
      const matchedGps = gpsSummaries.filter(
        (g: any) =>
          g.gps_summary_date?.toISOString().slice(0, 10) === date &&
          this.normalizeVehicle(g.gps_summary_vehicle_no) === vehicleNorm,
      );
      sources['gps'] = {
        source: 'GPS 追蹤',
        status: matchedGps.length > 0 ? 'found' : 'missing',
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

      // 5. 打卡（通過 employee_id 關聯）
      const employeeIds = wls
        .map((wl: any) => wl.employee_id)
        .filter((id: any) => id != null);
      const matchedAttendances = attendances.filter(
        (a: any) =>
          employeeIds.includes(a.employee_id) &&
          a.timestamp?.toISOString().slice(0, 10) === date,
      );
      sources['attendance'] = {
        source: '打卡紀錄',
        status: matchedAttendances.length > 0 ? 'found' : 'missing',
        details: matchedAttendances.map((a: any) => ({
          id: a.id,
          employee: a.employee?.name_zh || '—',
          type: a.type,
          timestamp: a.timestamp,
          address: a.address || '—',
        })),
      };

      // 6. WhatsApp Order
      const matchedWa = waOrderItems.filter(
        (item: any) =>
          item.order_date === date &&
          this.normalizeVehicle(item.wa_item_vehicle_no) === vehicleNorm,
      );
      sources['whatsapp_order'] = {
        source: 'WhatsApp Order',
        status: matchedWa.length > 0 ? 'found' : 'missing',
        details: matchedWa.map((item: any) => ({
          id: item.id,
          vehicle: item.wa_item_vehicle_no,
          driver: item.wa_item_driver_nickname || '—',
          customer: item.wa_item_customer || '—',
          contract: item.wa_item_contract_no || '—',
          location: item.wa_item_location || '—',
          work_desc: item.wa_item_work_desc || '—',
          is_suspended: item.wa_item_is_suspended,
          order_status: item.order_status,
          order_version: item.order_version,
        })),
      };

      // 計算匹配狀態
      const nonWorkSources = ['chit', 'delivery_note', 'gps', 'attendance', 'whatsapp_order'];
      const foundCount = nonWorkSources.filter((s) => sources[s].status === 'found').length;
      let matchStatus: MatchingRow['match_status'];

      if (foundCount === nonWorkSources.length) {
        matchStatus = 'full_match';
      } else if (foundCount === 0) {
        matchStatus = 'missing_source';
      } else if (foundCount >= 3) {
        matchStatus = 'partial_match';
      } else {
        matchStatus = 'missing_source';
      }

      // 檢查衝突（如果有數據但不一致）
      if (foundCount >= 2) {
        const hasConflict = this.checkVehicleConflicts(sources);
        if (hasConflict) matchStatus = 'conflict';
      }

      results.push({
        key: vehicleDisplay,
        date,
        sources,
        match_status: matchStatus,
        match_count: foundCount + 1, // +1 for work_log itself
        total_sources: nonWorkSources.length + 1,
      });
    }

    // 按日期排序
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
    // 按 date + employee_id 分組 work logs
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

      // 匹配各來源
      const sources: Record<string, SourceData> = {};

      // 1. 工作紀錄
      sources['work_log'] = {
        source: '工作紀錄',
        status: 'found',
        details: wls.map((wl: any) => ({
          id: wl.id,
          date,
          vehicle: wl.equipment_number || '—',
          employee: employeeName,
          customer: wl.client?.name || '—',
          contract: wl.contract?.contract_no || wl.client_contract_no || '—',
          location: `${wl.start_location || '—'} → ${wl.end_location || '—'}`,
          service_type: wl.service_type || '—',
        })),
      };

      // 2. 入帳票（通過車牌匹配）
      const vehicleNos = wls
        .map((wl: any) => wl.equipment_number)
        .filter(Boolean)
        .map((v: string) => this.normalizeVehicle(v));
      const matchedReceipts = receiptRecords.filter(
        (r: any) =>
          r.record_work_date?.toISOString().slice(0, 10) === date &&
          vehicleNos.includes(this.normalizeVehicle(r.record_vehicle_no)),
      );
      sources['chit'] = {
        source: '入帳票',
        status: matchedReceipts.length > 0 ? 'found' : 'missing',
        details: matchedReceipts.map((r: any) => ({
          id: r.id,
          vehicle: r.record_vehicle_no,
          location: r.record_location_from || '—',
          contract: r.record_contract_no || '—',
          chit_nos: r.chits?.map((c: any) => c.chit_no) || [],
        })),
      };

      // 3. 飛仔 OCR
      const matchedSlips = slipRecords.filter(
        (r: any) =>
          r.record_work_date?.toISOString().slice(0, 10) === date &&
          (vehicleNos.includes(this.normalizeVehicle(r.record_vehicle_no)) ||
            this.nameMatch(r.record_driver_name, employeeName, employeeNickname)),
      );
      sources['delivery_note'] = {
        source: '飛仔 OCR',
        status: matchedSlips.length > 0 ? 'found' : 'missing',
        details: matchedSlips.map((r: any) => ({
          id: r.id,
          vehicle: r.record_vehicle_no,
          slip_no: r.record_slip_no || '—',
          driver: r.record_driver_name || '—',
        })),
      };

      // 4. GPS（通過車牌匹配）
      const matchedGps = gpsSummaries.filter(
        (g: any) =>
          g.gps_summary_date?.toISOString().slice(0, 10) === date &&
          vehicleNos.includes(this.normalizeVehicle(g.gps_summary_vehicle_no)),
      );
      sources['gps'] = {
        source: 'GPS 追蹤',
        status: matchedGps.length > 0 ? 'found' : 'missing',
        details: matchedGps.map((g: any) => ({
          id: g.id,
          vehicle: g.gps_summary_vehicle_no,
          distance: g.gps_summary_total_distance,
          trip_count: g.gps_summary_trip_count,
        })),
      };

      // 5. 打卡
      const matchedAttendances = attendances.filter(
        (a: any) =>
          a.employee_id === employeeId &&
          a.timestamp?.toISOString().slice(0, 10) === date,
      );
      sources['attendance'] = {
        source: '打卡紀錄',
        status: matchedAttendances.length > 0 ? 'found' : 'missing',
        details: matchedAttendances.map((a: any) => ({
          id: a.id,
          type: a.type,
          timestamp: a.timestamp,
          address: a.address || '—',
        })),
      };

      // 6. WhatsApp Order（通過花名或車牌匹配）
      const matchedWa = waOrderItems.filter(
        (item: any) =>
          item.order_date === date &&
          (vehicleNos.includes(this.normalizeVehicle(item.wa_item_vehicle_no)) ||
            this.nameMatch(item.wa_item_driver_nickname, employeeName, employeeNickname)),
      );
      sources['whatsapp_order'] = {
        source: 'WhatsApp Order',
        status: matchedWa.length > 0 ? 'found' : 'missing',
        details: matchedWa.map((item: any) => ({
          id: item.id,
          vehicle: item.wa_item_vehicle_no || '—',
          driver: item.wa_item_driver_nickname || '—',
          customer: item.wa_item_customer || '—',
          contract: item.wa_item_contract_no || '—',
          is_suspended: item.wa_item_is_suspended,
        })),
      };

      // 計算匹配狀態
      const nonWorkSources = ['chit', 'delivery_note', 'gps', 'attendance', 'whatsapp_order'];
      const foundCount = nonWorkSources.filter((s) => sources[s].status === 'found').length;
      let matchStatus: MatchingRow['match_status'];

      if (foundCount === nonWorkSources.length) {
        matchStatus = 'full_match';
      } else if (foundCount === 0) {
        matchStatus = 'missing_source';
      } else if (foundCount >= 3) {
        matchStatus = 'partial_match';
      } else {
        matchStatus = 'missing_source';
      }

      results.push({
        key: employeeName,
        date,
        sources,
        match_status: matchStatus,
        match_count: foundCount + 1,
        total_sources: nonWorkSources.length + 1,
      });
    }

    results.sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));

    return results;
  }

  // ══════════════════════════════════════════════════════════════
  // 工具方法
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

  private checkVehicleConflicts(sources: Record<string, SourceData>): boolean {
    // 簡單衝突檢測：比較不同來源的車牌是否一致
    // 未來可以擴展更複雜的衝突檢測邏輯
    return false;
  }
}
