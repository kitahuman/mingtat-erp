import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DailyReportsService {
  constructor(private prisma: PrismaService) {}

  private readonly includeAll = {
    project: { select: { id: true, project_no: true, project_name: true, address: true, client: { select: { id: true, name: true } }, contract: { select: { id: true, contract_no: true } } } },
    client: { select: { id: true, name: true } },
    creator: { select: { id: true, displayName: true } },
    items: { orderBy: { daily_report_item_sort_order: 'asc' as const } },
  };

  async findAll(query: any) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const where: any = {};

    if (query.project_id) where.daily_report_project_id = Number(query.project_id);
    if (query.status) where.daily_report_status = query.status;
    if (query.created_by) where.daily_report_created_by = Number(query.created_by);
    if (query.date_from || query.date_to) {
      where.daily_report_date = {};
      if (query.date_from) where.daily_report_date.gte = new Date(query.date_from);
      if (query.date_to) where.daily_report_date.lte = new Date(query.date_to);
    }
    if (query.search) {
      where.OR = [
        { daily_report_work_summary: { contains: query.search, mode: 'insensitive' } },
        { daily_report_project_name: { contains: query.search, mode: 'insensitive' } },
        { daily_report_client_name: { contains: query.search, mode: 'insensitive' } },
        { project: { project_name: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.dailyReport.findMany({
        where,
        include: this.includeAll,
        orderBy: { daily_report_date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.dailyReport.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: number) {
    const report = await this.prisma.dailyReport.findUnique({
      where: { id },
      include: this.includeAll,
    });
    if (!report) throw new NotFoundException('日報不存在');
    return report;
  }

  private buildItemData(item: any, idx: number) {
    return {
      daily_report_item_category: item.category,
      daily_report_item_content: item.content || '',
      daily_report_item_quantity: item.quantity ? Number(item.quantity) : null,
      daily_report_item_ot_hours: item.ot_hours ? Number(item.ot_hours) : null,
      daily_report_item_name_or_plate: item.name_or_plate || null,
      daily_report_item_sort_order: idx,
      daily_report_item_worker_type: item.worker_type || null,
      daily_report_item_with_operator: item.with_operator ?? false,
      daily_report_item_employee_ids: item.employee_ids ? (typeof item.employee_ids === 'string' ? item.employee_ids : JSON.stringify(item.employee_ids)) : null,
      daily_report_item_vehicle_ids: item.vehicle_ids ? (typeof item.vehicle_ids === 'string' ? item.vehicle_ids : JSON.stringify(item.vehicle_ids)) : null,
      daily_report_item_shift_quantity: item.shift_quantity ? Number(item.shift_quantity) : null,
    };
  }

  private buildReportData(rd: any, userId: number) {
    return {
      daily_report_project_id: rd.project_id ? Number(rd.project_id) : null,
      daily_report_date: new Date(rd.report_date),
      daily_report_shift_type: rd.shift_type,
      daily_report_work_summary: rd.work_summary || '',
      daily_report_memo: rd.memo || null,
      daily_report_created_by: userId,
      daily_report_status: rd.status || 'draft',
      daily_report_submitted_at: rd.status === 'submitted' ? new Date() : null,
      daily_report_client_id: rd.client_id ? Number(rd.client_id) : null,
      daily_report_client_name: rd.client_name || null,
      daily_report_client_contract_no: rd.client_contract_no || null,
      daily_report_project_name: rd.project_name || null,
      daily_report_completed_work: rd.completed_work || null,
      daily_report_signature: rd.signature || null,
    };
  }

  async create(userId: number, dto: any) {
    const { items, ...rd } = dto;
    const report = await this.prisma.dailyReport.create({
      data: {
        ...this.buildReportData(rd, userId),
        items: items?.length ? {
          create: items.map((item: any, idx: number) => this.buildItemData(item, idx)),
        } : undefined,
      },
      include: this.includeAll,
    });
    return report;
  }

  async update(id: number, userId: number, dto: any) {
    const existing = await this.prisma.dailyReport.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('日報不存在');
    if (existing.daily_report_status === 'submitted') {
      throw new BadRequestException('已提交的日報不可修改');
    }

    const { items, ...rd } = dto;

    await this.prisma.dailyReportItem.deleteMany({ where: { daily_report_item_report_id: id } });

    const data: any = {
      daily_report_project_id: rd.project_id ? Number(rd.project_id) : null,
      daily_report_date: new Date(rd.report_date),
      daily_report_shift_type: rd.shift_type,
      daily_report_work_summary: rd.work_summary || '',
      daily_report_memo: rd.memo || null,
      daily_report_status: rd.status || 'draft',
      daily_report_submitted_at: rd.status === 'submitted' ? new Date() : null,
      daily_report_client_id: rd.client_id ? Number(rd.client_id) : null,
      daily_report_client_name: rd.client_name || null,
      daily_report_client_contract_no: rd.client_contract_no || null,
      daily_report_project_name: rd.project_name || null,
      daily_report_completed_work: rd.completed_work || null,
      daily_report_signature: rd.signature || null,
    };

    if (items?.length) {
      data.items = { create: items.map((item: any, idx: number) => this.buildItemData(item, idx)) };
    }

    const report = await this.prisma.dailyReport.update({
      where: { id },
      data,
      include: this.includeAll,
    });
    return report;
  }

  async remove(id: number) {
    const existing = await this.prisma.dailyReport.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('日報不存在');
    if (existing.daily_report_status === 'submitted') {
      throw new BadRequestException('已提交的日報不可刪除');
    }
    await this.prisma.dailyReport.delete({ where: { id } });
    return { success: true };
  }

  async findByProject(projectId: number, query?: any) {
    const page = Number(query?.page) || 1;
    const limit = Number(query?.limit) || 50;
    const where = { daily_report_project_id: projectId };

    const [data, total] = await Promise.all([
      this.prisma.dailyReport.findMany({
        where,
        include: {
          creator: { select: { id: true, displayName: true } },
          items: { orderBy: { daily_report_item_sort_order: 'asc' } },
        },
        orderBy: { daily_report_date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.dailyReport.count({ where }),
    ]);
    return { data, total, page, limit };
  }
}
