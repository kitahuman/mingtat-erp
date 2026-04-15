import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface StatsQuery {
  date_from?: string;
  date_to?: string;
  project_id?: string;
  client_id?: string;
  client_name?: string;
  client_contract_no?: string;
  status?: string;
}

export interface ItemSummary {
  category: string;
  worker_type: string | null;
  machine_type: string | null;
  tonnage: number | null;
  content: string;
  total_quantity: number;
  total_shift_quantity: number;
  total_ot_hours: number;
  total_tonnage: number;
  report_count: number;
}

export interface DailyDetail {
  report_id: number;
  date: string;
  shift_type: string;
  creator: string;
  items: {
    category: string;
    worker_type: string | null;
    machine_type: string | null;
    tonnage: number | null;
    content: string;
    quantity: number | null;
    shift_quantity: number | null;
    ot_hours: number | null;
    name_or_plate: string | null;
    with_operator: boolean;
  }[];
}

export interface ProjectGroup {
  project_id: number | null;
  project_no: string;
  project_name: string;
  client_name: string;
  client_contract_no: string;
  report_count: number;
  date_range: { from: string; to: string };
  summary: ItemSummary[];
  daily_details: DailyDetail[];
}

@Injectable()
export class DailyReportStatsService {
  constructor(private prisma: PrismaService) {}

  private toNum(v: any): number {
    return Number(v) || 0;
  }

  async getStats(query: StatsQuery): Promise<{ data: ProjectGroup[]; totals: any }> {
    // Build where clause
    const where: any = { daily_report_deleted_at: null };

    if (query.status) {
      where.daily_report_status = query.status;
    } else {
      // Default: only submitted reports for statistics
      where.daily_report_status = 'submitted';
    }

    if (query.project_id) {
      where.daily_report_project_id = Number(query.project_id);
    }
    if (query.client_id) {
      where.daily_report_client_id = Number(query.client_id);
    }
    if (query.client_name) {
      where.daily_report_client_name = { contains: query.client_name, mode: 'insensitive' };
    }
    if (query.client_contract_no) {
      where.daily_report_client_contract_no = { contains: query.client_contract_no, mode: 'insensitive' };
    }
    if (query.date_from || query.date_to) {
      where.daily_report_date = {};
      if (query.date_from) where.daily_report_date.gte = new Date(query.date_from);
      if (query.date_to) where.daily_report_date.lte = new Date(query.date_to);
    }

    // Fetch all matching reports with items
    const reports = await this.prisma.dailyReport.findMany({
      where,
      include: {
        project: {
          select: {
            id: true,
            project_no: true,
            project_name: true,
            client: { select: { id: true, name: true } },
            contract: { select: { id: true, contract_no: true } },
          },
        },
        client: { select: { id: true, name: true } },
        creator: { select: { id: true, displayName: true } },
        items: { orderBy: { daily_report_item_sort_order: 'asc' as const } },
      },
      orderBy: { daily_report_date: 'asc' },
    });

    // Group by project
    const projectMap = new Map<string, any[]>();

    for (const report of reports) {
      const key = report.daily_report_project_id
        ? String(report.daily_report_project_id)
        : `unnamed_${report.daily_report_project_name || 'unknown'}`;
      if (!projectMap.has(key)) {
        projectMap.set(key, []);
      }
      projectMap.get(key)!.push(report);
    }

    // Build project groups
    const data: ProjectGroup[] = [];
    let grandTotalWorkerQty = 0;
    let grandTotalWorkerOt = 0;
    let grandTotalWorkerShift = 0;
    let grandTotalVehicleQty = 0;
    let grandTotalVehicleOt = 0;
    let grandTotalMachineryQty = 0;
    let grandTotalMachineryOt = 0;
    let grandTotalReports = 0;

    for (const [key, groupReports] of projectMap) {
      const firstReport = groupReports[0];

      const projectName = firstReport.daily_report_project_name
        || firstReport.project?.project_name
        || '未指定工程';
      const projectNo = firstReport.project?.project_no || '-';
      const clientName = firstReport.daily_report_client_name
        || firstReport.client?.name
        || firstReport.project?.client?.name
        || '-';
      const clientContractNo = firstReport.daily_report_client_contract_no || '-';

      // Calculate date range
      const dates = groupReports.map(r => new Date(r.daily_report_date).getTime());
      const minDate = new Date(Math.min(...dates));
      const maxDate = new Date(Math.max(...dates));

      // Aggregate items by category + worker_type + content
      const itemMap = new Map<string, ItemSummary>();

      for (const report of groupReports) {
        for (const item of report.items) {
          const itemKey = `${item.daily_report_item_category}||${item.daily_report_item_worker_type || ''}||${item.daily_report_item_machine_type || ''}||${item.daily_report_item_content}`;
          if (!itemMap.has(itemKey)) {
            itemMap.set(itemKey, {
              category: item.daily_report_item_category,
              worker_type: item.daily_report_item_worker_type,
              machine_type: item.daily_report_item_machine_type || null,
              tonnage: item.daily_report_item_tonnage ? this.toNum(item.daily_report_item_tonnage) : null,
              content: item.daily_report_item_content,
              total_quantity: 0,
              total_shift_quantity: 0,
              total_ot_hours: 0,
              total_tonnage: 0,
              report_count: 0,
            });
          }
          const summary = itemMap.get(itemKey)!;
          summary.total_quantity += this.toNum(item.daily_report_item_quantity);
          summary.total_shift_quantity += this.toNum(item.daily_report_item_shift_quantity);
          summary.total_ot_hours += this.toNum(item.daily_report_item_ot_hours);
          // total_tonnage = quantity × tonnage per unit (if tonnage is set)
          if (item.daily_report_item_tonnage) {
            summary.total_tonnage += this.toNum(item.daily_report_item_quantity) * this.toNum(item.daily_report_item_tonnage);
          }
          summary.report_count += 1;
        }
      }

      // Build daily details
      const dailyDetails: DailyDetail[] = groupReports.map(report => ({
        report_id: report.id,
        date: report.daily_report_date.toISOString().split('T')[0],
        shift_type: report.daily_report_shift_type,
        creator: report.creator?.displayName || '-',
        items: report.items.map((item: any) => ({
          category: item.daily_report_item_category,
          worker_type: item.daily_report_item_worker_type,
          machine_type: item.daily_report_item_machine_type || null,
          tonnage: item.daily_report_item_tonnage ? this.toNum(item.daily_report_item_tonnage) : null,
          content: item.daily_report_item_content,
          quantity: this.toNum(item.daily_report_item_quantity) || null,
          shift_quantity: this.toNum(item.daily_report_item_shift_quantity) || null,
          ot_hours: this.toNum(item.daily_report_item_ot_hours) || null,
          name_or_plate: item.daily_report_item_name_or_plate,
          with_operator: item.daily_report_item_with_operator || false,
        })),
      }));

      const summaryArr = Array.from(itemMap.values());

      // Accumulate grand totals
      for (const s of summaryArr) {
        if (s.category === 'worker') {
          grandTotalWorkerQty += s.total_quantity;
          grandTotalWorkerOt += s.total_ot_hours;
          grandTotalWorkerShift += s.total_shift_quantity;
        } else if (s.category === 'vehicle') {
          grandTotalVehicleQty += s.total_quantity;
          grandTotalVehicleOt += s.total_ot_hours;
        } else if (s.category === 'machinery') {
          grandTotalMachineryQty += s.total_quantity;
          grandTotalMachineryOt += s.total_ot_hours;
        }
      }
      grandTotalReports += groupReports.length;

      data.push({
        project_id: firstReport.daily_report_project_id,
        project_no: projectNo,
        project_name: projectName,
        client_name: clientName,
        client_contract_no: clientContractNo,
        report_count: groupReports.length,
        date_range: {
          from: minDate.toISOString().split('T')[0],
          to: maxDate.toISOString().split('T')[0],
        },
        summary: summaryArr,
        daily_details: dailyDetails,
      });
    }

    // Sort by project_no
    data.sort((a, b) => a.project_no.localeCompare(b.project_no));

    return {
      data,
      totals: {
        total_projects: data.length,
        total_reports: grandTotalReports,
        total_worker_quantity: Math.round(grandTotalWorkerQty * 100) / 100,
        total_worker_ot_hours: Math.round(grandTotalWorkerOt * 100) / 100,
        total_worker_shift_quantity: Math.round(grandTotalWorkerShift * 100) / 100,
        total_vehicle_quantity: Math.round(grandTotalVehicleQty * 100) / 100,
        total_vehicle_ot_hours: Math.round(grandTotalVehicleOt * 100) / 100,
        total_machinery_quantity: Math.round(grandTotalMachineryQty * 100) / 100,
        total_machinery_ot_hours: Math.round(grandTotalMachineryOt * 100) / 100,
      },
    };
  }

  /**
   * Flat export data: one row per item per report, suitable for CSV/Excel export
   */
  async getExportData(query: StatsQuery): Promise<any[]> {
    const where: any = { daily_report_deleted_at: null };

    if (query.status) {
      where.daily_report_status = query.status;
    } else {
      where.daily_report_status = 'submitted';
    }

    if (query.project_id) {
      where.daily_report_project_id = Number(query.project_id);
    }
    if (query.client_id) {
      where.daily_report_client_id = Number(query.client_id);
    }
    if (query.client_name) {
      where.daily_report_client_name = { contains: query.client_name, mode: 'insensitive' };
    }
    if (query.client_contract_no) {
      where.daily_report_client_contract_no = { contains: query.client_contract_no, mode: 'insensitive' };
    }
    if (query.date_from || query.date_to) {
      where.daily_report_date = {};
      if (query.date_from) where.daily_report_date.gte = new Date(query.date_from);
      if (query.date_to) where.daily_report_date.lte = new Date(query.date_to);
    }

    const reports = await this.prisma.dailyReport.findMany({
      where,
      include: {
        project: {
          select: { id: true, project_no: true, project_name: true },
        },
        client: { select: { id: true, name: true } },
        creator: { select: { id: true, displayName: true } },
        items: { orderBy: { daily_report_item_sort_order: 'asc' as const } },
      },
      orderBy: [
        { daily_report_project_id: 'asc' },
        { daily_report_date: 'asc' },
      ],
    });

    const rows: any[] = [];
    for (const report of reports) {
      const projectName = report.daily_report_project_name || report.project?.project_name || '-';
      const projectNo = report.project?.project_no || '-';
      const clientName = report.daily_report_client_name || report.client?.name || '-';

      if (report.items.length === 0) {
        rows.push({
          date: report.daily_report_date.toISOString().split('T')[0],
          project_no: projectNo,
          project_name: projectName,
          client_name: clientName,
          client_contract_no: report.daily_report_client_contract_no || '-',
          shift_type: report.daily_report_shift_type,
          creator: report.creator?.displayName || '-',
          category: '-',
          worker_type: '-',
          content: '-',
          quantity: 0,
          shift_quantity: 0,
          ot_hours: 0,
          name_or_plate: '-',
        });
      } else {
        for (const item of report.items) {
          rows.push({
            date: report.daily_report_date.toISOString().split('T')[0],
            project_no: projectNo,
            project_name: projectName,
            client_name: clientName,
            client_contract_no: report.daily_report_client_contract_no || '-',
            shift_type: report.daily_report_shift_type,
            creator: report.creator?.displayName || '-',
            category: item.daily_report_item_category,
            worker_type: item.daily_report_item_worker_type || '-',
            content: item.daily_report_item_content,
            quantity: this.toNum(item.daily_report_item_quantity),
            shift_quantity: this.toNum(item.daily_report_item_shift_quantity),
            ot_hours: this.toNum(item.daily_report_item_ot_hours),
            name_or_plate: item.daily_report_item_name_or_plate || '-',
            machine_type: item.daily_report_item_machine_type || '-',
            tonnage: item.daily_report_item_tonnage ? this.toNum(item.daily_report_item_tonnage) : null,
          });
        }
      }
    }

    return rows;
  }

  /**
   * Get project cost analysis from daily reports + rate cards.
   * Aggregates resource usage from daily reports and matches with rate cards
   * to calculate estimated costs, then compares with quotation budget.
   */
  async getProjectCost(projectId: number, dateFrom?: string, dateTo?: string) {
    // 1. Fetch project info
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        client: { select: { id: true, name: true } },
        contract: { select: { id: true, contract_no: true, contract_name: true } },
      },
    });
    if (!project) return null;

    // 2. Fetch daily reports for this project
    const reportWhere: any = {
      daily_report_project_id: projectId,
      daily_report_deleted_at: null,
      daily_report_status: 'submitted',
    };
    if (dateFrom || dateTo) {
      reportWhere.daily_report_date = {};
      if (dateFrom) reportWhere.daily_report_date.gte = new Date(dateFrom);
      if (dateTo) reportWhere.daily_report_date.lte = new Date(dateTo);
    }

    const reports = await this.prisma.dailyReport.findMany({
      where: reportWhere,
      include: {
        items: { orderBy: { daily_report_item_sort_order: 'asc' as const } },
        creator: { select: { id: true, displayName: true } },
      },
      orderBy: { daily_report_date: 'asc' },
    });

    // 3. Fetch rate cards for this project
    const rateCards = await this.prisma.rateCard.findMany({
      where: {
        project_id: projectId,
        status: 'active',
        deleted_at: null,
      },
      orderBy: { name: 'asc' },
    });

    // 4. Fetch quotations for budget comparison
    const quotations = await this.prisma.quotation.findMany({
      where: {
        project_id: projectId,
        deleted_at: null,
        status: { in: ['accepted', 'sent'] },
      },
      include: {
        items: { orderBy: { sort_order: 'asc' } },
      },
    });

    // 5. Aggregate resource usage from daily reports
    const resourceMap = new Map<string, {
      category: string;
      worker_type: string | null;
      content: string;
      total_quantity: number;
      total_shift_quantity: number;
      total_ot_hours: number;
      report_count: number;
      matched_rate_card_id: number | null;
      matched_rate_card_name: string | null;
      day_rate: number;
      ot_rate: number;
      mid_shift_rate: number;
      estimated_day_cost: number;
      estimated_ot_cost: number;
      estimated_shift_cost: number;
      estimated_total_cost: number;
    }>();

    for (const report of reports) {
      for (const item of report.items) {
        const key = `${item.daily_report_item_category}||${item.daily_report_item_worker_type || ''}||${item.daily_report_item_content}`;
        if (!resourceMap.has(key)) {
          // Try to match a rate card
          const matched = this.matchRateCard(
            rateCards,
            item.daily_report_item_category,
            item.daily_report_item_worker_type,
            item.daily_report_item_content,
          );
          resourceMap.set(key, {
            category: item.daily_report_item_category,
            worker_type: item.daily_report_item_worker_type,
            content: item.daily_report_item_content,
            total_quantity: 0,
            total_shift_quantity: 0,
            total_ot_hours: 0,
            report_count: 0,
            matched_rate_card_id: matched?.id || null,
            matched_rate_card_name: matched?.name || null,
            day_rate: this.toNum(matched?.day_rate),
            ot_rate: this.toNum(matched?.ot_rate),
            mid_shift_rate: this.toNum(matched?.mid_shift_rate),
            estimated_day_cost: 0,
            estimated_ot_cost: 0,
            estimated_shift_cost: 0,
            estimated_total_cost: 0,
          });
        }
        const res = resourceMap.get(key)!;
        const qty = this.toNum(item.daily_report_item_quantity);
        const shiftQty = this.toNum(item.daily_report_item_shift_quantity);
        const otHours = this.toNum(item.daily_report_item_ot_hours);
        res.total_quantity += qty;
        res.total_shift_quantity += shiftQty;
        res.total_ot_hours += otHours;
        res.report_count += 1;
      }
    }

    // 6. Calculate costs for each resource
    const resources = Array.from(resourceMap.values());
    let totalDayCost = 0;
    let totalOtCost = 0;
    let totalShiftCost = 0;
    let totalEstimatedCost = 0;

    for (const res of resources) {
      res.estimated_day_cost = this.round2(res.total_quantity * res.day_rate);
      res.estimated_ot_cost = this.round2(res.total_ot_hours * res.ot_rate);
      res.estimated_shift_cost = this.round2(res.total_shift_quantity * res.mid_shift_rate);
      res.estimated_total_cost = this.round2(
        res.estimated_day_cost + res.estimated_ot_cost + res.estimated_shift_cost,
      );
      totalDayCost += res.estimated_day_cost;
      totalOtCost += res.estimated_ot_cost;
      totalShiftCost += res.estimated_shift_cost;
      totalEstimatedCost += res.estimated_total_cost;
    }

    // 7. Category subtotals
    const categoryTotals: Record<string, {
      category: string;
      total_quantity: number;
      total_shift_quantity: number;
      total_ot_hours: number;
      estimated_cost: number;
      item_count: number;
    }> = {};
    for (const res of resources) {
      if (!categoryTotals[res.category]) {
        categoryTotals[res.category] = {
          category: res.category,
          total_quantity: 0,
          total_shift_quantity: 0,
          total_ot_hours: 0,
          estimated_cost: 0,
          item_count: 0,
        };
      }
      const ct = categoryTotals[res.category];
      ct.total_quantity += res.total_quantity;
      ct.total_shift_quantity += res.total_shift_quantity;
      ct.total_ot_hours += res.total_ot_hours;
      ct.estimated_cost += res.estimated_total_cost;
      ct.item_count += 1;
    }

    // 8. Budget from quotations
    let totalBudget = 0;
    const budgetItems: { quotation_no: string; item_name: string; amount: number }[] = [];
    for (const q of quotations) {
      for (const item of q.items) {
        const amount = this.toNum(item.amount);
        totalBudget += amount;
        budgetItems.push({
          quotation_no: q.quotation_no,
          item_name: item.item_name || item.item_description || '-',
          amount: this.round2(amount),
        });
      }
    }

    // 9. Daily breakdown for chart
    const dailyBreakdown: {
      date: string;
      shift_type: string;
      worker_count: number;
      vehicle_count: number;
      machinery_count: number;
      total_ot_hours: number;
    }[] = [];
    for (const report of reports) {
      let wc = 0, vc = 0, mc = 0, ot = 0;
      for (const item of report.items) {
        const qty = this.toNum(item.daily_report_item_quantity);
        const otH = this.toNum(item.daily_report_item_ot_hours);
        if (item.daily_report_item_category === 'worker') wc += qty;
        else if (item.daily_report_item_category === 'vehicle') vc += qty;
        else if (item.daily_report_item_category === 'machinery') mc += qty;
        ot += otH;
      }
      dailyBreakdown.push({
        date: report.daily_report_date.toISOString().split('T')[0],
        shift_type: report.daily_report_shift_type,
        worker_count: this.round2(wc),
        vehicle_count: this.round2(vc),
        machinery_count: this.round2(mc),
        total_ot_hours: this.round2(ot),
      });
    }

    const variance = totalBudget - totalEstimatedCost;
    const varianceRate = totalBudget > 0
      ? this.round2((variance / totalBudget) * 100)
      : 0;

    return {
      project: {
        id: project.id,
        project_no: project.project_no,
        project_name: project.project_name,
        status: project.status,
        client: project.client,
      },
      summary: {
        total_reports: reports.length,
        date_range: reports.length > 0 ? {
          from: reports[0].daily_report_date.toISOString().split('T')[0],
          to: reports[reports.length - 1].daily_report_date.toISOString().split('T')[0],
        } : null,
        total_estimated_cost: this.round2(totalEstimatedCost),
        total_day_cost: this.round2(totalDayCost),
        total_ot_cost: this.round2(totalOtCost),
        total_shift_cost: this.round2(totalShiftCost),
        total_budget: this.round2(totalBudget),
        variance: this.round2(variance),
        variance_rate: varianceRate,
      },
      category_totals: Object.values(categoryTotals).map(ct => ({
        ...ct,
        total_quantity: this.round2(ct.total_quantity),
        total_shift_quantity: this.round2(ct.total_shift_quantity),
        total_ot_hours: this.round2(ct.total_ot_hours),
        estimated_cost: this.round2(ct.estimated_cost),
      })),
      resources: resources.map(r => ({
        ...r,
        total_quantity: this.round2(r.total_quantity),
        total_shift_quantity: this.round2(r.total_shift_quantity),
        total_ot_hours: this.round2(r.total_ot_hours),
      })),
      rate_cards: rateCards.map(rc => ({
        id: rc.id,
        name: rc.name,
        service_type: rc.service_type,
        day_rate: this.toNum(rc.day_rate),
        night_rate: this.toNum(rc.night_rate),
        ot_rate: this.toNum(rc.ot_rate),
        mid_shift_rate: this.toNum(rc.mid_shift_rate),
        unit: rc.unit || rc.day_unit,
      })),
      budget_items: budgetItems,
      daily_breakdown: dailyBreakdown,
    };
  }

  /**
   * Try to match a daily report item to a rate card by name/content similarity.
   * Matching logic: service_type or name contains the worker_type or content.
   */
  private matchRateCard(
    rateCards: any[],
    category: string,
    workerType: string | null | undefined,
    content: string,
  ): any | null {
    if (rateCards.length === 0) return null;

    // Normalize for comparison
    const contentLower = (content || '').toLowerCase().trim();
    const workerTypeLower = (workerType || '').toLowerCase().trim();

    // Try exact match on name first
    for (const rc of rateCards) {
      const rcName = (rc.name || '').toLowerCase().trim();
      const rcService = (rc.service_type || '').toLowerCase().trim();
      if (rcName && (rcName === contentLower || rcName === workerTypeLower)) return rc;
      if (rcService && (rcService === contentLower || rcService === workerTypeLower)) return rc;
    }

    // Try contains match
    for (const rc of rateCards) {
      const rcName = (rc.name || '').toLowerCase().trim();
      const rcService = (rc.service_type || '').toLowerCase().trim();
      if (contentLower && rcName && (rcName.includes(contentLower) || contentLower.includes(rcName))) return rc;
      if (workerTypeLower && rcName && (rcName.includes(workerTypeLower) || workerTypeLower.includes(rcName))) return rc;
      if (contentLower && rcService && (rcService.includes(contentLower) || contentLower.includes(rcService))) return rc;
      if (workerTypeLower && rcService && (rcService.includes(workerTypeLower) || workerTypeLower.includes(rcService))) return rc;
    }

    return null;
  }

  private round2(v: number): number {
    return Math.round(v * 100) / 100;
  }
}
