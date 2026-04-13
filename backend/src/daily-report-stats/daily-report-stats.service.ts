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
  content: string;
  total_quantity: number;
  total_shift_quantity: number;
  total_ot_hours: number;
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
          const itemKey = `${item.daily_report_item_category}||${item.daily_report_item_worker_type || ''}||${item.daily_report_item_content}`;
          if (!itemMap.has(itemKey)) {
            itemMap.set(itemKey, {
              category: item.daily_report_item_category,
              worker_type: item.daily_report_item_worker_type,
              content: item.daily_report_item_content,
              total_quantity: 0,
              total_shift_quantity: 0,
              total_ot_hours: 0,
              report_count: 0,
            });
          }
          const summary = itemMap.get(itemKey)!;
          summary.total_quantity += this.toNum(item.daily_report_item_quantity);
          summary.total_shift_quantity += this.toNum(item.daily_report_item_shift_quantity);
          summary.total_ot_hours += this.toNum(item.daily_report_item_ot_hours);
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
          });
        }
      }
    }

    return rows;
  }
}
