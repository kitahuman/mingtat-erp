import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 工程日報核對服務
 * 第一層：按日期 + 員工ID / 車牌 精確比對
 * 第二層：按日期 + 工程 + 工種/機種 數量比對（當 item 沒有具體員工/車牌時）
 */

type MatchStatus = 'matched' | 'quantity_matched' | 'diff' | 'missing' | 'source_missing' | 'unverified';

interface DailyReportVerificationResult {
  daily_report_item_id: number;
  status: MatchStatus;
  matched_work_log_ids: number[];
  quantity_info?: {
    report_quantity: number;
    actual_quantity: number;
  };
}

interface WorkLogVerificationResult {
  work_log_id: number;
  status: MatchStatus;
  matched_daily_report_item_ids: number[];
  quantity_info?: {
    report_quantity: number;
    actual_quantity: number;
  };
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
   * 判斷 item 是否有具體的員工/車牌資訊（用於決定走第一層還是第二層）
   */
  private itemHasSpecificIdentifier(item: {
    daily_report_item_employee_ids: string | null;
    daily_report_item_vehicle_ids: string | null;
    daily_report_item_name_or_plate: string | null;
  }): boolean {
    const empIds = this.parseJsonIds(item.daily_report_item_employee_ids);
    if (empIds.length > 0) return true;
    const vehIds = this.parseJsonIds(item.daily_report_item_vehicle_ids);
    if (vehIds.length > 0) return true;
    if (item.daily_report_item_name_or_plate && item.daily_report_item_name_or_plate.trim().length > 0) return true;
    return false;
  }

  /**
   * 觸發指定日報的核對（含第一層精確匹配和第二層數量匹配）
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
        service_type: true,
        project_id: true,
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
          select: { id: true, machine_code: true, tonnage: true, machine_type: true },
        })
      : [];

    const vehiclePlateMap = new Map(vehicles.map(v => [v.id, this.normalizeVehicle(v.current_plate?.plate_number || v.plate_number)]));
    const machineryPlateMap = new Map(machineries.map(m => [m.id, this.normalizeVehicle(m.machine_code)]));
    const machineryInfoMap = new Map(machineries.map(m => [m.id, { tonnage: m.tonnage, type: m.machine_type }]));

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
      let matchMethod = 'auto_daily_report';
      let matchStatus: 'matched' | 'quantity_matched' | 'diff' | 'missing' = 'missing';
      let quantityInfo: { report_quantity: number; actual_quantity: number } | null = null;

      const hasSpecificId = this.itemHasSpecificIdentifier(item);

      if (hasSpecificId) {
        // ═══ 第一層：精確匹配 ═══
        // 按員工ID比對
        const employeeIds = this.parseJsonIds(item.daily_report_item_employee_ids);
        for (const empId of employeeIds) {
          const wlIds = workLogsByEmployeeId.get(empId) || [];
          wlIds.forEach(id => itemMatchedWlIds.add(id));
        }

        // 按車牌/機號比對
        const vehicleIdsFromItem = this.parseJsonIds(item.daily_report_item_vehicle_ids);
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

        if (itemMatchedWlIds.size > 0) {
          matchStatus = 'matched';
        }
      } else {
        // ═══ 第二層：數量匹配（item 沒有具體員工/車牌） ═══
        matchMethod = 'auto_daily_report_quantity';
        const reportQuantity = item.daily_report_item_quantity ? Number(item.daily_report_item_quantity) : 0;
        const projectId = report.daily_report_project_id;
        const category = item.daily_report_item_category; // worker/vehicle/machinery/tool
        const content = item.daily_report_item_content?.trim().toLowerCase() || '';
        const workerType = item.daily_report_item_worker_type?.trim().toLowerCase() || '';
        const machineType = item.daily_report_item_machine_type?.trim().toLowerCase() || '';
        const tonnage = item.daily_report_item_tonnage ? Number(item.daily_report_item_tonnage) : null;

        // 找同日期 + 同工程的工作記錄
        let candidateWls = workLogs;
        if (projectId) {
          candidateWls = candidateWls.filter(wl => wl.project_id === projectId);
        }

        let actualCount = 0;

        if (category === 'worker') {
          // 按工種匹配：service_type 或 content 包含工種描述
          const matchingWls = candidateWls.filter(wl => {
            if (!wl.employee_id) return false;
            // 比對 service_type 是否包含工種關鍵字
            const st = wl.service_type?.trim().toLowerCase() || '';
            if (content && st.includes(content)) return true;
            if (workerType && st.includes(workerType)) return true;
            // 如果 content 是通用描述（如「什工」「雜工」），匹配所有有員工的工作記錄
            if (content && (content.includes('什工') || content.includes('雜工') || content.includes('散工'))) {
              return true;
            }
            return false;
          });
          actualCount = matchingWls.length;
          matchingWls.forEach(wl => itemMatchedWlIds.add(wl.id));
        } else if (category === 'vehicle') {
          // 按車輛匹配
          const matchingWls = candidateWls.filter(wl => {
            if (!wl.work_log_vehicle_id && !wl.equipment_number) return false;
            return true;
          });
          actualCount = matchingWls.length;
          matchingWls.forEach(wl => itemMatchedWlIds.add(wl.id));
        } else if (category === 'machinery') {
          // 按機種/噸數匹配
          const matchingWls = candidateWls.filter(wl => {
            if (!wl.work_log_machinery_id) return false;
            const info = machineryInfoMap.get(wl.work_log_machinery_id);
            if (!info) return false;
            // 按噸數匹配
            if (tonnage !== null && info.tonnage !== null) {
              // info.tonnage is now a string like "30噸", daily_report_item_tonnage is Decimal
              if (Number(info.tonnage) === tonnage) return true;
              // Also try matching by extracting numeric part from string tonnage
              const numericTonnage = parseFloat(String(info.tonnage));
              if (!isNaN(numericTonnage) && numericTonnage === tonnage) return true;
            }
            // 按機種匹配
            if (machineType && info.type) {
              if (info.type.toLowerCase().includes(machineType)) return true;
            }
            // 如果 content 包含機種描述
            if (content && info.type) {
              if (info.type.toLowerCase().includes(content) || content.includes(info.type.toLowerCase())) return true;
            }
            return false;
          });
          actualCount = matchingWls.length;
          matchingWls.forEach(wl => itemMatchedWlIds.add(wl.id));
        } else if (category === 'tool') {
          // 工具類型 - 不做數量匹配，標記為 unverified
          matchStatus = 'missing';
        }

        if (category !== 'tool') {
          quantityInfo = { report_quantity: reportQuantity, actual_quantity: actualCount };
          if (actualCount > 0 && reportQuantity > 0) {
            if (actualCount === reportQuantity) {
              matchStatus = 'quantity_matched';
            } else {
              matchStatus = 'diff';
            }
          } else if (actualCount > 0 && reportQuantity === 0) {
            // 日報沒寫數量但有找到工作記錄
            matchStatus = 'quantity_matched';
          } else {
            matchStatus = 'missing';
          }
        }
      }

      // 記錄匹配的 work_log_ids
      itemMatchedWlIds.forEach(id => matchedWorkLogIds.add(id));

      // 更新 VerificationMatch: item → work_logs
      // 先刪除舊的自動配對記錄（兩種 method 都刪）
      await this.prisma.verificationMatch.deleteMany({
        where: {
          match_source_id: sourceId,
          match_method: { in: ['auto_daily_report', 'auto_daily_report_quantity'] },
          match_diff_fields: {
            path: ['daily_report_item_id'],
            equals: item.id,
          },
        },
      });

      if (itemMatchedWlIds.size > 0 && (matchStatus === 'matched' || matchStatus === 'quantity_matched' || matchStatus === 'diff')) {
        // 為每個匹配的 work_log 建立記錄
        for (const wlId of itemMatchedWlIds) {
          await this.prisma.verificationMatch.create({
            data: {
              match_work_record_id: wlId,
              match_source_id: sourceId,
              match_record_id: null,
              match_status: matchStatus,
              match_confidence: matchStatus === 'matched' ? 100 : matchStatus === 'quantity_matched' ? 80 : 60,
              match_method: matchMethod,
              match_diff_fields: {
                daily_report_item_id: item.id,
                daily_report_id: report.id,
                ...(quantityInfo ? { quantity_info: quantityInfo } : {}),
              },
              match_diff_count: matchStatus === 'diff' ? 1 : 0,
              match_notes: matchStatus === 'matched'
                ? `日報 #${report.id} 項目 #${item.id} 精確配對`
                : matchStatus === 'quantity_matched'
                  ? `日報 #${report.id} 項目 #${item.id} 數量匹配 (${quantityInfo?.report_quantity}/${quantityInfo?.actual_quantity})`
                  : `日報 #${report.id} 項目 #${item.id} 數量不符 (日報${quantityInfo?.report_quantity}/實際${quantityInfo?.actual_quantity})`,
            },
          });
        }
      }
    }

    // 處理工作記錄有但日報沒有的情況 (source_missing)
    const unmatchedWorkLogIds = workLogs
      .map(wl => wl.id)
      .filter(id => !matchedWorkLogIds.has(id));

    // 刪除舊的 source_missing 記錄
    await this.prisma.verificationMatch.deleteMany({
      where: {
        match_source_id: sourceId,
        match_method: { in: ['auto_daily_report', 'auto_daily_report_quantity'] },
        match_status: 'source_missing',
        match_work_record_id: { in: workLogs.map(wl => wl.id) },
        match_diff_fields: {
          path: ['daily_report_id'],
          equals: report.id,
        },
      },
    });

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
    status: MatchStatus;
    matched_items: Array<{
      id: number;
      daily_report_id: number;
      category: string;
      content: string;
      name_or_plate: string | null;
      quantity: number | null;
    }>;
    quantity_info?: {
      report_quantity: number;
      actual_quantity: number;
    };
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
                quantity: item.daily_report_item_quantity ? Number(item.daily_report_item_quantity) : null,
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
        match_method: { in: ['auto_daily_report', 'auto_daily_report_quantity'] },
        match_status: { in: ['matched', 'quantity_matched', 'diff'] },
      },
    });

    if (matches.length > 0) {
      const itemIds = matches
        .map(m => (m.match_diff_fields as Record<string, unknown>)?.daily_report_item_id as number)
        .filter((id): id is number => typeof id === 'number');

      const items = itemIds.length > 0
        ? await this.prisma.dailyReportItem.findMany({
            where: { id: { in: [...new Set(itemIds)] } },
            include: { report: { select: { id: true } } },
          })
        : [];

      // 取得最佳匹配狀態
      const hasExact = matches.some(m => m.match_status === 'matched');
      const hasQuantity = matches.some(m => m.match_status === 'quantity_matched');
      const hasDiff = matches.some(m => m.match_status === 'diff');
      const bestStatus: MatchStatus = hasExact ? 'matched' : hasQuantity ? 'quantity_matched' : hasDiff ? 'diff' : 'missing';

      // 取得數量資訊
      const quantityMatch = matches.find(m => m.match_status === 'quantity_matched' || m.match_status === 'diff');
      const quantityInfo = quantityMatch
        ? (quantityMatch.match_diff_fields as Record<string, unknown>)?.quantity_info as { report_quantity: number; actual_quantity: number } | undefined
        : undefined;

      return {
        status: bestStatus,
        matched_items: items.map(item => ({
          id: item.id,
          daily_report_id: item.report.id,
          category: item.daily_report_item_category,
          content: item.daily_report_item_content,
          name_or_plate: item.daily_report_item_name_or_plate,
          quantity: item.daily_report_item_quantity ? Number(item.daily_report_item_quantity) : null,
        })),
        quantity_info: quantityInfo,
      };
    }

    // 檢查同日期是否有日報存在
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
   * 取得指定日報 item 的核對狀態（含第二層數量匹配）
   */
  async getDailyReportItemVerificationStatus(reportId: number): Promise<
    Array<{
      item_id: number;
      status: MatchStatus;
      matched_work_log_ids: number[];
      matched_work_logs: Array<{
        id: number;
        equipment_number: string | null;
        employee_name: string | null;
        service_type: string | null;
      }>;
      quantity_info?: {
        report_quantity: number;
        actual_quantity: number;
      };
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
        match_method: { in: ['auto_daily_report', 'auto_daily_report_quantity'] },
        match_status: { in: ['matched', 'quantity_matched', 'diff'] },
      },
    });

    // 按 item_id 分組
    const matchesByItemId = new Map<number, Array<{ wlId: number; status: string; quantityInfo?: { report_quantity: number; actual_quantity: number } }>>();
    for (const m of matches) {
      const itemId = (m.match_diff_fields as Record<string, unknown>)?.daily_report_item_id as number;
      const reportIdFromMatch = (m.match_diff_fields as Record<string, unknown>)?.daily_report_id as number;
      if (itemId && reportIdFromMatch === reportId) {
        const existing = matchesByItemId.get(itemId) || [];
        existing.push({
          wlId: m.match_work_record_id,
          status: m.match_status,
          quantityInfo: (m.match_diff_fields as Record<string, unknown>)?.quantity_info as { report_quantity: number; actual_quantity: number } | undefined,
        });
        matchesByItemId.set(itemId, existing);
      }
    }

    // 收集所有匹配的 work_log_ids
    const allWlIds = new Set<number>();
    for (const entries of matchesByItemId.values()) {
      entries.forEach(e => allWlIds.add(e.wlId));
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
      const matchEntries = matchesByItemId.get(item.id) || [];
      const matchedWlIds = matchEntries.map(e => e.wlId);

      // 決定 item 的最終狀態
      let status: MatchStatus;
      let quantityInfo: { report_quantity: number; actual_quantity: number } | undefined;

      if (matchEntries.length === 0) {
        status = 'missing';
      } else {
        const hasExact = matchEntries.some(e => e.status === 'matched');
        const hasQuantity = matchEntries.some(e => e.status === 'quantity_matched');
        const hasDiff = matchEntries.some(e => e.status === 'diff');

        if (hasExact) {
          status = 'matched';
        } else if (hasQuantity) {
          status = 'quantity_matched';
          quantityInfo = matchEntries.find(e => e.status === 'quantity_matched')?.quantityInfo;
        } else if (hasDiff) {
          status = 'diff';
          quantityInfo = matchEntries.find(e => e.status === 'diff')?.quantityInfo;
        } else {
          status = 'missing';
        }
      }

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
        quantity_info: quantityInfo,
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
   * 批量取得工作記錄的日報核對狀態（用於 workbench 和 matching overview）
   * 返回 Map<workLogId, status>
   */
  async getWorkLogsDailyReportStatuses(workLogIds: number[]): Promise<Map<number, MatchStatus>> {
    const result = new Map<number, MatchStatus>();
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

    // 查詢自動配對（含 quantity_matched 和 diff）
    const matches = await this.prisma.verificationMatch.findMany({
      where: {
        match_work_record_id: { in: workLogIds },
        match_source_id: sourceId,
        match_method: { in: ['auto_daily_report', 'auto_daily_report_quantity'] },
        match_status: { in: ['matched', 'quantity_matched', 'diff'] },
      },
      select: { match_work_record_id: true, match_status: true },
    });

    // 按 work_log_id 取最佳狀態
    const autoStatusMap = new Map<number, MatchStatus>();
    for (const m of matches) {
      const current = autoStatusMap.get(m.match_work_record_id);
      const newStatus = m.match_status as MatchStatus;
      // 優先級: matched > quantity_matched > diff
      if (!current || this.statusPriority(newStatus) > this.statusPriority(current)) {
        autoStatusMap.set(m.match_work_record_id, newStatus);
      }
    }

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

      const autoStatus = autoStatusMap.get(wl.id);
      if (autoStatus) {
        result.set(wl.id, autoStatus);
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

  /**
   * 狀態優先級（越高越好）
   */
  private statusPriority(status: MatchStatus): number {
    switch (status) {
      case 'matched': return 4;
      case 'quantity_matched': return 3;
      case 'diff': return 2;
      case 'missing': return 1;
      case 'source_missing': return 1;
      case 'unverified': return 0;
      default: return 0;
    }
  }
}
