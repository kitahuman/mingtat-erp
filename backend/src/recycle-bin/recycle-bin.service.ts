import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RecycleBinService {
  constructor(private prisma: PrismaService) {}

  /**
   * 軟刪除記錄（標記為已刪除）
   */
  async softDelete(table: string, id: number) {
    const now = new Date();
    
    switch (table) {
      case 'companies':
        return this.prisma.company.update({
          where: { id },
          data: { deleted_at: now },
        });
      case 'employees':
        return this.prisma.employee.update({
          where: { id },
          data: { deleted_at: now },
        });
      case 'vehicles':
        return this.prisma.vehicle.update({
          where: { id },
          data: { deleted_at: now },
        });
      case 'machinery':
        return this.prisma.machinery.update({
          where: { id },
          data: { deleted_at: now },
        });
      case 'partners':
        return this.prisma.partner.update({
          where: { id },
          data: { deleted_at: now },
        });
      case 'contracts':
        return this.prisma.contract.update({
          where: { id },
          data: { deleted_at: now },
        });
      case 'projects':
        return this.prisma.project.update({
          where: { id },
          data: { deleted_at: now },
        });
      case 'quotations':
        return this.prisma.quotation.update({
          where: { id },
          data: { deleted_at: now },
        });
      case 'rate_cards':
        return this.prisma.rateCard.update({
          where: { id },
          data: { deleted_at: now },
        });
      case 'expenses':
        return this.prisma.expense.update({
          where: { id },
          data: { deleted_at: now },
        });
      case 'invoices':
        return this.prisma.invoice.update({
          where: { id },
          data: { deleted_at: now },
        });
      case 'work_logs':
        return this.prisma.workLog.update({
          where: { id },
          data: { deleted_at: now },
        });
      case 'daily_reports':
        return this.prisma.dailyReport.update({
          where: { id },
          data: { daily_report_deleted_at: now },
        });
      default:
        throw new Error(`Unsupported table: ${table}`);
    }
  }

  /**
   * 恢復已刪除的記錄
   */
  async restore(table: string, id: number) {
    switch (table) {
      case 'companies':
        return this.prisma.company.update({
          where: { id },
          data: { deleted_at: null },
        });
      case 'employees':
        return this.prisma.employee.update({
          where: { id },
          data: { deleted_at: null },
        });
      case 'vehicles':
        return this.prisma.vehicle.update({
          where: { id },
          data: { deleted_at: null },
        });
      case 'machinery':
        return this.prisma.machinery.update({
          where: { id },
          data: { deleted_at: null },
        });
      case 'partners':
        return this.prisma.partner.update({
          where: { id },
          data: { deleted_at: null },
        });
      case 'contracts':
        return this.prisma.contract.update({
          where: { id },
          data: { deleted_at: null },
        });
      case 'projects':
        return this.prisma.project.update({
          where: { id },
          data: { deleted_at: null },
        });
      case 'quotations':
        return this.prisma.quotation.update({
          where: { id },
          data: { deleted_at: null },
        });
      case 'rate_cards':
        return this.prisma.rateCard.update({
          where: { id },
          data: { deleted_at: null },
        });
      case 'expenses':
        return this.prisma.expense.update({
          where: { id },
          data: { deleted_at: null },
        });
      case 'invoices':
        return this.prisma.invoice.update({
          where: { id },
          data: { deleted_at: null },
        });
      case 'work_logs':
        return this.prisma.workLog.update({
          where: { id },
          data: { deleted_at: null },
        });
      case 'daily_reports':
        return this.prisma.dailyReport.update({
          where: { id },
          data: { daily_report_deleted_at: null },
        });
      default:
        throw new Error(`Unsupported table: ${table}`);
    }
  }

  /**
   * 永久刪除記錄
   */
  async permanentDelete(table: string, id: number) {
    switch (table) {
      case 'companies':
        return this.prisma.company.delete({ where: { id } });
      case 'employees':
        return this.prisma.employee.delete({ where: { id } });
      case 'vehicles':
        return this.prisma.vehicle.delete({ where: { id } });
      case 'machinery':
        return this.prisma.machinery.delete({ where: { id } });
      case 'partners':
        return this.prisma.partner.delete({ where: { id } });
      case 'contracts':
        return this.prisma.contract.delete({ where: { id } });
      case 'projects':
        return this.prisma.project.delete({ where: { id } });
      case 'quotations':
        return this.prisma.quotation.delete({ where: { id } });
      case 'rate_cards':
        return this.prisma.rateCard.delete({ where: { id } });
      case 'expenses':
        return this.prisma.expense.delete({ where: { id } });
      case 'invoices':
        return this.prisma.invoice.delete({ where: { id } });
      case 'work_logs':
        return this.prisma.workLog.delete({ where: { id } });
      case 'daily_reports':
        return this.prisma.dailyReport.delete({ where: { id } });
      default:
        throw new Error(`Unsupported table: ${table}`);
    }
  }

  /**
   * 查詢垃圾桶中的記錄
   */
  async findDeleted(query: {
    page?: number;
    limit?: number;
    table?: string;
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 25;
    const table = query.table || 'all';

    const results: any[] = [];
    let total = 0;

    const tables = table === 'all' 
      ? ['companies', 'employees', 'vehicles', 'machinery', 'partners', 'contracts', 'projects', 'quotations', 'rate_cards', 'expenses', 'invoices', 'work_logs', 'daily_reports']
      : [table];

    for (const t of tables) {
      let count = 0;
      let data: any[] = [];

      try {
        switch (t) {
          case 'companies':
            count = await this.prisma.company.count({ where: { deleted_at: { not: null } } });
            data = await this.prisma.company.findMany({
              where: { deleted_at: { not: null } },
              orderBy: { deleted_at: 'desc' },
              take: limit,
              skip: (page - 1) * limit,
            });
            break;
          case 'employees':
            count = await this.prisma.employee.count({ where: { deleted_at: { not: null } } });
            data = await this.prisma.employee.findMany({
              where: { deleted_at: { not: null } },
              select: { id: true, name_zh: true, emp_code: true, deleted_at: true },
              orderBy: { deleted_at: 'desc' },
              take: limit,
              skip: (page - 1) * limit,
            });
            break;
          case 'vehicles':
            count = await this.prisma.vehicle.count({ where: { deleted_at: { not: null } } });
            data = await this.prisma.vehicle.findMany({
              where: { deleted_at: { not: null } },
              select: { id: true, plate_number: true, machine_type: true, deleted_at: true },
              orderBy: { deleted_at: 'desc' },
              take: limit,
              skip: (page - 1) * limit,
            });
            break;
          case 'machinery':
            count = await this.prisma.machinery.count({ where: { deleted_at: { not: null } } });
            data = await this.prisma.machinery.findMany({
              where: { deleted_at: { not: null } },
              select: { id: true, machine_code: true, machine_type: true, deleted_at: true },
              orderBy: { deleted_at: 'desc' },
              take: limit,
              skip: (page - 1) * limit,
            });
            break;
          case 'partners':
            count = await this.prisma.partner.count({ where: { deleted_at: { not: null } } });
            data = await this.prisma.partner.findMany({
              where: { deleted_at: { not: null } },
              select: { id: true, code: true, name: true, deleted_at: true },
              orderBy: { deleted_at: 'desc' },
              take: limit,
              skip: (page - 1) * limit,
            });
            break;
          case 'contracts':
            count = await this.prisma.contract.count({ where: { deleted_at: { not: null } } });
            data = await this.prisma.contract.findMany({
              where: { deleted_at: { not: null } },
              select: { id: true, contract_no: true, contract_name: true, deleted_at: true },
              orderBy: { deleted_at: 'desc' },
              take: limit,
              skip: (page - 1) * limit,
            });
            break;
          case 'projects':
            count = await this.prisma.project.count({ where: { deleted_at: { not: null } } });
            data = await this.prisma.project.findMany({
              where: { deleted_at: { not: null } },
              select: { id: true, project_no: true, project_name: true, deleted_at: true },
              orderBy: { deleted_at: 'desc' },
              take: limit,
              skip: (page - 1) * limit,
            });
            break;
          case 'quotations':
            count = await this.prisma.quotation.count({ where: { deleted_at: { not: null } } });
            data = await this.prisma.quotation.findMany({
              where: { deleted_at: { not: null } },
              select: { id: true, quotation_no: true, quotation_date: true, deleted_at: true },
              orderBy: { deleted_at: 'desc' },
              take: limit,
              skip: (page - 1) * limit,
            });
            break;
          case 'rate_cards':
            count = await this.prisma.rateCard.count({ where: { deleted_at: { not: null } } });
            data = await this.prisma.rateCard.findMany({
              where: { deleted_at: { not: null } },
              select: { id: true, name: true, rate_card_type: true, deleted_at: true },
              orderBy: { deleted_at: 'desc' },
              take: limit,
              skip: (page - 1) * limit,
            });
            break;
          case 'expenses':
            count = await this.prisma.expense.count({ where: { deleted_at: { not: null } } });
            data = await this.prisma.expense.findMany({
              where: { deleted_at: { not: null } },
              select: { id: true, item: true, date: true, deleted_at: true },
              orderBy: { deleted_at: 'desc' },
              take: limit,
              skip: (page - 1) * limit,
            });
            break;
          case 'invoices':
            count = await this.prisma.invoice.count({ where: { deleted_at: { not: null } } });
            data = await this.prisma.invoice.findMany({
              where: { deleted_at: { not: null } },
              select: { id: true, invoice_no: true, date: true, deleted_at: true },
              orderBy: { deleted_at: 'desc' },
              take: limit,
              skip: (page - 1) * limit,
            });
            break;
          case 'work_logs':
            count = await this.prisma.workLog.count({ where: { deleted_at: { not: null } } });
            data = await this.prisma.workLog.findMany({
              where: { deleted_at: { not: null } },
              select: { id: true, service_type: true, scheduled_date: true, deleted_at: true },
              orderBy: { deleted_at: 'desc' },
              take: limit,
              skip: (page - 1) * limit,
            });
            break;
          case 'daily_reports':
            count = await this.prisma.dailyReport.count({ where: { daily_report_deleted_at: { not: null } } });
            data = await this.prisma.dailyReport.findMany({
              where: { daily_report_deleted_at: { not: null } },
              select: { id: true, daily_report_date: true, daily_report_deleted_at: true },
              orderBy: { daily_report_deleted_at: 'desc' },
              take: limit,
              skip: (page - 1) * limit,
            });
            break;
        }

        results.push(...data.map(item => ({
          ...item,
          table: t,
          deleted_at: item.deleted_at || item.daily_report_deleted_at,
        })));
        total += count;
      } catch (err) {
        console.error(`Error fetching deleted records from ${t}:`, err);
      }
    }

    // Sort by deleted_at descending and apply pagination
    const sorted = results.sort((a, b) => new Date(b.deleted_at).getTime() - new Date(a.deleted_at).getTime());

    return {
      data: sorted.slice((page - 1) * limit, page * limit),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
