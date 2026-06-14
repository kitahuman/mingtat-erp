import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 工程日報核對服務
 * 按日期 + 員工ID / 車牌 比對 DailyReportItem 與 WorkLog
 */

interface DailyReportVerificationResult {
  daily_report_item_id: number;
  status: 'matched' | 'missing'; // matched=找到工作記錄, missing=日報有但工作記錄沒有
  matched_work_log_ids: number[];
}

interface WorkLogVerificationResult {
  work_log_id: number;
  status: 'matched' | 'source_missing'; // matched=找到日報, source_missing=工作記錄有但日報沒有
  matched_daily_report_item_ids: number[];
}

@Injectable()
export class DailyReportVerificationService {
  private readonly logger = new Logger(DailyReportVerificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 取得 daily_report source ID
   */
  private async getDailyReportSourceId(): Promise<number | null> {
    const source = await this.prisma.verificationSource.findUnique({
      where: { source_code: 'daily_report' },
    });
    return source?.id ?? null;
  }

  /**
   * 正規化車牌
   */
  private normalizeVehicle(plate: string | null | undefined): string {
    if (!plate) return '';
    return plate.toUpperCase().replace(/[\s\-]/g, '');
  }

  /**
   * 解析 JSON text 欄位為 number[]
   */
  private parseJsonIds(jsonText: string | null | undefined): number[] {
    if (!jsonText) return [];
    try {
      const parsed = JSON.parse(jsonText);
      if (Array.isArray(parsed)) {
        return parsed.filter((id): id is number => typeof id === 'number' && Number.isFinite(id));
      }
      return [];
    } catch {
      return [];
    }
  }

  /**
   * 觸發指定日期範圍的日報核對
   * 用於日報建立/修改/刪除時
   */
  async verifyByDailyReport(reportId: number): Promise<void> {
    const report = await this.prisma.dailyReport.findUnique({
      where: { id: reportId },
      include: { items: true },
    });
    if (!report || report.daily_report_deleted_at) return;

    const sourceId = await this.getDailyReportSourceId();
    if (!sourceId) {
      this.logger.warn('daily_report source not found in verification_sources');
      return;
    }

    const date = report.daily_report_date;
    if (!date) return;

    // 取得同日期的所有工作記錄
    const workLogs = await this.prisma.workLog.findMany({
      where: {
        scheduled_date: date,
        deleted_at: null,
        status: { not: 'cancelled' },
      },
      select: {
        id: true,
        employee_id: true,
        equipment_number: true,
        work_log_machinery_id: true,
        work_log_vehicle_id: true,
      },
    });

    // 建立索引
    const workLogsByEmployeeId = new Map<number, number[]>();
    const workLogsByVehicleNorm = new Map<string, number[]>();

    for (const wl of workLogs) {
      if (wl.employee_id) {
        const existing = workLogsByEmployeeId.get(wl.employee_id) || [];
        existing.push(wl.id);
        workLogsByEmployeeId.set(wl.employee_id, existing);
      }
      const vNorm = this.normalizeVehicle(wl.equipment_number);
      if (vNorm) {
        const existing = workLogsByVehicleNorm.get(vNorm) || [];
        existing.push(wl.id);
        workLogsByVehicleNorm.set(vNorm, existing);
      }
    }

    // 取得車輛和機械的車牌映射
    const vehicleIds = new Set<number>();
    const machineryIds = new Set<number>();
    for (const wl of workLogs) {
      if (wl.work_log_vehicle_id) vehicleIds.add(wl.work_log_vehicle_id);
      if (wl.work_log_machinery_id) machineryIds.add(wl.work_log_machinery_id);
    }

    const vehicles = vehicleIds.size > 0
      ? await this.prisma.vehicle.findMany({
          where: { id: { in: Array.from(vehicleIds) } },
          select: { id: true, plate_number: true, current_plate: { select: { plate_number: true } } },
        })
      : [];
    const machineries = machineryIds.size > 0
      ? await this.prisma.machinery.findMany({
          where: { id: { in: Array.from(machineryIds) } },
          select: { id: true, machine_code: true },
        })
      : [];

    const vehiclePlateMap = new Map(vehicles.map(v => [v.id, this.normalizeVehicle(v.current_plate?.plate_number || v.plate_number)]));
    const machineryPlateMap = new Map(machineries.map(m => [m.id, this.normalizeVehicle(m.machine_code)]));

    // 為每個 work_log 建立 vehicle/machinery plate 索引
    for (const wl of workLogs) {
      if (wl.work_log_vehicle_id) {
        const plate = vehiclePlateMap.get(wl.work_log_vehicle_id);
        if (plate) {
          const existing = workLogsByVehicleNorm.get(plate) || [];
          if (!existing.includes(wl.id)) {
            existing.push(wl.id);
            workLogsByVehicleNorm.set(plate, existing);
          }
        }
      }
      if (wl.work_log_machinery_id) {
        const plate = machineryPlateMap.get(wl.work_log_machinery_id);
        if (plate) {
          const existing = workLogsByVehicleNorm.get(plate) || [];
          if (!existing.includes(wl.id)) {
            existing.push(wl.id);
            workLogsByVehicleNorm.set(plate, existing);
          }
        }
      }
    }

    // 比對每個日報 item
    const matchedWorkLogIds = new Set<number>();

    for (const item of report.items) {
      const itemMatchedWlIds = new Set<number>();

      // 按員工ID比對
      const employeeIds = this.parseJsonIds(item.daily_report_item_employee_ids);
      for (const empId of employeeIds) {
        const wlIds = workLogsByEmployeeId.get(empId) || [];
        wlIds.forEach(id => itemMatchedWlIds.add(id));
      }

      // 按車牌/機號比對
      const vehicleIdsFromItem = this.parseJsonIds(item.daily_report_item_vehicle_ids);
      // 查詢車輛和機械的車牌
      if (vehicleIdsFromItem.length > 0) {
        const itemVehicles = await this.prisma.vehicle.findMany({
          where: { id: { in: vehicleIdsFromItem } },
          select: { plate_number: true, current_plate: { select: { plate_number: true } } },
        });
        const itemMachineries = await this.prisma.machinery.findMany({
          where: { id: { in: vehicleIdsFromItem } },
          select: { machine_code: true },
        });
        for (const v of itemVehicles) {
          const plate = this.normalizeVehicle(v.current_plate?.plate_number || v.plate_number);
          if (plate) {
            const wlIds = workLogsByVehicleNorm.get(plate) || [];
            wlIds.forEach(id => itemMatchedWlIds.add(id));
          }
        }
        for (const m of itemMachineries) {
          const plate = this.normalizeVehicle(m.machine_code);
          if (plate) {
            const wlIds = workLogsByVehicleNorm.get(plate) || [];
            wlIds.forEach(id => itemMatchedWlIds.add(id));
          }
        }
      }

      // 按 name_or_plate 比對
      const nameOrPlate = this.normalizeVehicle(item.daily_report_item_name_or_plate);
      if (nameOrPlate) {
        const wlIds = workLogsByVehicleNorm.get(nameOrPlate) || [];
        wlIds.forEach(id => itemMatchedWlIds.add(id));
      }

      // 記錄匹配的 work_log_ids
      itemMatchedWlIds.forEach(id => matchedWorkLogIds.add(id));

      // 更新 VerificationMatch: item → work_logs
      // 先刪除舊的自動配對記錄
      await this.prisma.verificationMatch.deleteMany({
        where: {
          match_source_id: sourceId,
          match_method: 'auto_daily_report',
          match_diff_fields: {
            path: ['daily_report_item_id'],
            equals: item.id,
          },
        },
      });

      if (itemMatchedWlIds.size > 0) {
        // 為每個匹配的 work_log 建立記錄
        for (const wlId of itemMatchedWlIds) {
          await this.prisma.verificationMatch.create({
            data: {
              match_work_record_id: wlId,
              match_source_id: sourceId,
              match_record_id: null,
              match_status: 'matched',
              match_confidence: 100,
              match_method: 'auto_daily_report',
              match_diff_fields: {
                daily_report_item_id: item.id,
                daily_report_id: report.id,
              },
              match_diff_count: 0,
              match_notes: `日報 #${report.id} 項目 #${item.id} 自動配對`,
            },
          });
        }
      }
    }

    // 處理工作記錄有但日報沒有的情況 (source_missing)
    // 找出同日期有工作記錄但沒有被任何日報 item 匹配到的
    const unmatchedWorkLogIds = workLogs
      .map(wl => wl.id)
      .filter(id => !matchedWorkLogIds.has(id));

    // 刪除舊的 source_missing 記錄
    await this.prisma.verificationMatch.deleteMany({
      where: {
        match_source_id: sourceId,
        match_method: 'auto_daily_report',
        match_status: 'source_missing',
        match_work_record_id: { in: workLogs.map(wl => wl.id) },
        match_diff_fields: {
          path: ['daily_report_id'],
          equals: report.id,
        },
      },
    });

    // 不需要為 source_missing 建立 VerificationMatch 記錄
    // 因為 workbench 會在查詢時動態計算

    this.logger.log(
      `Daily report #${reportId} verification complete: ${matchedWorkLogIds.size} matched, ${unmatchedWorkLogIds.length} source_missing`,
    );
  }

  /**
   * 觸發指定日期的日報核對（用於工作記錄修改時）
   */
  async verifyByDate(date: Date): Promise<void> {
    const reports = await this.prisma.dailyReport.findMany({
      where: {
        daily_report_date: date,
        daily_report_deleted_at: null,
      },
      select: { id: true },
    });

    for (const report of reports) {
      await this.verifyByDailyReport(report.id);
    }
  }

  /**
   * 取得指定工作記錄的日報核對狀態
   * 用於 workbench 和 matchSingle
   */
  async getWorkLogDailyReportStatus(workLogId: number): Promise<{
    status: 'matched' | 'missing' | 'unverified';
    matched_items: Array<{
      id: number;
      daily_report_id: number;
      category: string;
      content: string;
      name_or_plate: string | null;
    }>;
  }> {
    const sourceId = await this.getDailyReportSourceId();
    if (!sourceId) return { status: 'unverified', matched_items: [] };

    // 檢查手動配對
    const confirmation = await this.prisma.verificationConfirmation.findUnique({
      where: {
        work_log_id_source_code: {
          work_log_id: workLogId,
          source_code: 'daily_report',
        },
      },
    });

    if (confirmation) {
      if (confirmation.status === 'manual_match' || confirmation.status === 'confirmed') {
        // 手動配對 - 查詢配對的 item
        if (confirmation.matched_record_id) {
          const item = await this.prisma.dailyReportItem.findUnique({
            where: { id: confirmation.matched_record_id },
            include: { report: { select: { id: true } } },
          });
          if (item) {
            return {
              status: 'matched',
              matched_items: [{
                id: item.id,
                daily_report_id: item.report.id,
                category: item.daily_report_item_category,
                content: item.daily_report_item_content,
                name_or_plate: item.daily_report_item_name_or_plate,
              }],
            };
          }
        }
        return { status: 'matched', matched_items: [] };
      }
      if (confirmation.status === 'skipped') {
        return { status: 'unverified', matched_items: [] };
      }
    }

    // 自動配對 - 查詢 VerificationMatch
    const matches = await this.prisma.verificationMatch.findMany({
      where: {
        match_work_record_id: workLogId,
        match_source_id: sourceId,
        match_method: 'auto_daily_report',
        match_status: 'matched',
      },
    });

    if (matches.length > 0) {
      const itemIds = matches
        .map(m => (m.match_diff_fields as Record<string, unknown>)?.daily_report_item_id as number)
        .filter((id): id is number => typeof id === 'number');

      const items = itemIds.length > 0
        ? await this.prisma.dailyReportItem.findMany({
            where: { id: { in: itemIds } },
            include: { report: { select: { id: true } } },
          })
        : [];

      return {
        status: 'matched',
        matched_items: items.map(item => ({
          id: item.id,
          daily_report_id: item.report.id,
          category: item.daily_report_item_category,
          content: item.daily_report_item_content,
          name_or_plate: item.daily_report_item_name_or_plate,
        })),
      };
    }

    // 檢查同日期是否有日報存在（如果有日報但沒匹配到，就是 missing）
    const workLog = await this.prisma.workLog.findUnique({
      where: { id: workLogId },
      select: { scheduled_date: true },
    });
    if (!workLog?.scheduled_date) return { status: 'unverified', matched_items: [] };

    const hasReports = await this.prisma.dailyReport.count({
      where: {
        daily_report_date: workLog.scheduled_date,
        daily_report_deleted_at: null,
      },
    });

    if (hasReports > 0) {
      return { status: 'missing', matched_items: [] };
    }

    return { status: 'unverified', matched_items: [] };
  }

  /**
   * 取得指定日報 item 的核對狀態
   * 用於日報詳情頁
   */
  async getDailyReportItemVerificationStatus(reportId: number): Promise<
    Array<{
      item_id: number;
      status: 'matched' | 'missing' | 'unverified';
      matched_work_log_ids: number[];
      matched_work_logs: Array<{
        id: number;
        equipment_number: string | null;
        employee_name: string | null;
        service_type: string | null;
      }>;
    }>
  > {
    const report = await this.prisma.dailyReport.findUnique({
      where: { id: reportId },
      include: { items: true },
    });
    if (!report || report.daily_report_deleted_at) return [];

    const sourceId = await this.getDailyReportSourceId();
    if (!sourceId) {
      return report.items.map(item => ({
        item_id: item.id,
        status: 'unverified' as const,
        matched_work_log_ids: [],
        matched_work_logs: [],
      }));
    }

    // 查詢所有自動配對記錄
    const matches = await this.prisma.verificationMatch.findMany({
      where: {
        match_source_id: sourceId,
        match_method: 'auto_daily_report',
        match_status: 'matched',
      },
    });

    // 按 item_id 分組
    const matchesByItemId = new Map<number, number[]>();
    for (const m of matches) {
      const itemId = (m.match_diff_fields as Record<string, unknown>)?.daily_report_item_id as number;
      const reportIdFromMatch = (m.match_diff_fields as Record<string, unknown>)?.daily_report_id as number;
      if (itemId && reportIdFromMatch === reportId) {
        const existing = matchesByItemId.get(itemId) || [];
        existing.push(m.match_work_record_id);
        matchesByItemId.set(itemId, existing);
      }
    }

    // 收集所有匹配的 work_log_ids
    const allWlIds = new Set<number>();
    for (const ids of matchesByItemId.values()) {
      ids.forEach(id => allWlIds.add(id));
    }

    // 批量查詢 work_logs
    const workLogs = allWlIds.size > 0
      ? await this.prisma.workLog.findMany({
          where: { id: { in: Array.from(allWlIds) } },
          select: {
            id: true,
            equipment_number: true,
            employee: { select: { name_zh: true, nickname: true } },
            service_type: true,
          },
        })
      : [];
    const wlMap = new Map(workLogs.map(wl => [wl.id, wl]));

    return report.items.map(item => {
      const matchedWlIds = matchesByItemId.get(item.id) || [];
      const status: 'matched' | 'missing' | 'unverified' = matchedWlIds.length > 0 ? 'matched' : 'missing';

      return {
        item_id: item.id,
        status,
        matched_work_log_ids: matchedWlIds,
        matched_work_logs: matchedWlIds
          .map(id => wlMap.get(id))
          .filter((wl): wl is NonNullable<typeof wl> => wl != null)
          .map(wl => ({
            id: wl.id,
            equipment_number: wl.equipment_number,
            employee_name: (wl.employee as { name_zh?: string; nickname?: string } | null)?.name_zh ||
              (wl.employee as { name_zh?: string; nickname?: string } | null)?.nickname || null,
            service_type: wl.service_type,
          })),
      };
    });
  }

  /**
   * 搜尋可配對的日報 items（手動配對用）
   */
  async searchDailyReportItems(params: {
    date: string;
    search: string;
  }): Promise<Array<{
    id: number;
    report_id: number;
    report_date: string;
    shift_type: string;
    category: string;
    content: string;
    name_or_plate: string | null;
    quantity: number | null;
    project_name: string | null;
  }>> {
    const dateObj = new Date(params.date);

    const items = await this.prisma.dailyReportItem.findMany({
      where: {
        report: {
          daily_report_date: dateObj,
          daily_report_deleted_at: null,
        },
        OR: params.search
          ? [
              { daily_report_item_content: { contains: params.search, mode: 'insensitive' } },
              { daily_report_item_name_or_plate: { contains: params.search, mode: 'insensitive' } },
            ]
          : undefined,
      },
      include: {
        report: {
          select: {
            id: true,
            daily_report_date: true,
            daily_report_shift_type: true,
            daily_report_project_name: true,
          },
        },
      },
      take: 50,
    });

    return items.map(item => ({
      id: item.id,
      report_id: item.report.id,
      report_date: item.report.daily_report_date.toISOString().slice(0, 10),
      shift_type: item.report.daily_report_shift_type,
      category: item.daily_report_item_category,
      content: item.daily_report_item_content,
      name_or_plate: item.daily_report_item_name_or_plate,
      quantity: item.daily_report_item_quantity ? Number(item.daily_report_item_quantity) : null,
      project_name: item.report.daily_report_project_name,
    }));
  }

  /**
   * 批量取得工作記錄的日報核對狀態（用於 workbench）
   */
  async getWorkLogsDailyReportStatuses(workLogIds: number[]): Promise<Map<number, 'matched' | 'missing' | 'unverified'>> {
    const result = new Map<number, 'matched' | 'missing' | 'unverified'>();
    if (workLogIds.length === 0) return result;

    const sourceId = await this.getDailyReportSourceId();
    if (!sourceId) {
      workLogIds.forEach(id => result.set(id, 'unverified'));
      return result;
    }

    // 查詢手動配對
    const confirmations = await this.prisma.verificationConfirmation.findMany({
      where: {
        work_log_id: { in: workLogIds },
        source_code: 'daily_report',
      },
    });
    const confirmMap = new Map(confirmations.map(c => [c.work_log_id, c]));

    // 查詢自動配對
    const matches = await this.prisma.verificationMatch.findMany({
      where: {
        match_work_record_id: { in: workLogIds },
        match_source_id: sourceId,
        match_method: 'auto_daily_report',
        match_status: 'matched',
      },
      select: { match_work_record_id: true },
    });
    const autoMatchedIds = new Set(matches.map(m => m.match_work_record_id));

    // 查詢工作記錄的日期
    const workLogs = await this.prisma.workLog.findMany({
      where: { id: { in: workLogIds } },
      select: { id: true, scheduled_date: true },
    });

    // 查詢哪些日期有日報
    const dates = [...new Set(
      workLogs
        .map(wl => wl.scheduled_date?.toISOString().slice(0, 10))
        .filter((d): d is string => d != null),
    )];

    const reportsCountByDate = new Map<string, number>();
    if (dates.length > 0) {
      const dateObjs = dates.map(d => new Date(d));
      const reports = await this.prisma.dailyReport.groupBy({
        by: ['daily_report_date'],
        where: {
          daily_report_date: { in: dateObjs },
          daily_report_deleted_at: null,
        },
        _count: { id: true },
      });
      for (const r of reports) {
        const dateKey = r.daily_report_date.toISOString().slice(0, 10);
        reportsCountByDate.set(dateKey, r._count.id);
      }
    }

    for (const wl of workLogs) {
      const confirm = confirmMap.get(wl.id);
      if (confirm) {
        if (confirm.status === 'manual_match' || confirm.status === 'confirmed') {
          result.set(wl.id, 'matched');
          continue;
        }
        if (confirm.status === 'skipped') {
          result.set(wl.id, 'unverified');
          continue;
        }
      }

      if (autoMatchedIds.has(wl.id)) {
        result.set(wl.id, 'matched');
        continue;
      }

      // 檢查同日期是否有日報
      const dateKey = wl.scheduled_date?.toISOString().slice(0, 10);
      if (dateKey && (reportsCountByDate.get(dateKey) || 0) > 0) {
        result.set(wl.id, 'missing');
      } else {
        result.set(wl.id, 'unverified');
      }
    }

    return result;
  }
}
