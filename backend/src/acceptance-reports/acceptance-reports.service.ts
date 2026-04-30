import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AcceptanceReportsService {
  constructor(private prisma: PrismaService) {}

  private readonly includeAll = {
    client: { select: { id: true, name: true } },
    project: { select: { id: true, project_no: true, project_name: true, address: true, client: { select: { id: true, name: true } }, contract: { select: { id: true, contract_no: true } } } },
    inspector: { select: { id: true, name_zh: true, name_en: true, emp_code: true } },
    creator: { select: { id: true, displayName: true } },
    attachments: { orderBy: { acceptance_report_attachment_sort_order: 'asc' as const } },
    acceptance_items: { orderBy: { acceptance_report_item_sort_order: 'asc' as const } },
  };

  private readonly allowedSortFields = [
    'id', 'acceptance_report_date', 'acceptance_report_status',
    'acceptance_report_project_name', 'acceptance_report_client_name',
    'acceptance_report_client_contract_no', 'created_at',
  ];

  async findAll(query: any) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const where: any = {};

    const sortBy = this.allowedSortFields.includes(query.sortBy || '') ? query.sortBy : 'acceptance_report_date';
    const sortOrder = query.sortOrder?.toUpperCase() === 'ASC' ? 'asc' : 'desc';
    const relationSortMap: Record<string, any> = {
      project: { project: { project_name: sortOrder } },
      client: { client: { name: sortOrder } },
      creator: { creator: { displayName: sortOrder } },
    };
    const orderBy = relationSortMap[sortBy] || { [sortBy]: sortOrder };

    if (query.project_id) where.acceptance_report_project_id = Number(query.project_id);
    if (query.client_id) where.acceptance_report_client_id = Number(query.client_id);
    if (query.client_name) where.acceptance_report_client_name = { contains: query.client_name, mode: 'insensitive' };
    if (query.client_contract_no) where.acceptance_report_client_contract_no = { contains: query.client_contract_no, mode: 'insensitive' };
    if (query.status) where.acceptance_report_status = query.status;
    if (query.created_by) where.acceptance_report_created_by = Number(query.created_by);
    if (query.date_from || query.date_to) {
      where.acceptance_report_date = {};
      if (query.date_from) where.acceptance_report_date.gte = new Date(query.date_from);
      if (query.date_to) where.acceptance_report_date.lte = new Date(query.date_to);
    }
    if (query.search) {
      where.OR = [
        { acceptance_report_project_name: { contains: query.search, mode: 'insensitive' } },
        { acceptance_report_client_name: { contains: query.search, mode: 'insensitive' } },
        { acceptance_report_client_contract_no: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.acceptanceReport.findMany({
        where,
        include: this.includeAll,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.acceptanceReport.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: number) {
    const report = await this.prisma.acceptanceReport.findUnique({
      where: { id },
      include: this.includeAll,
    });
    if (!report) throw new NotFoundException('收貨報告不存在');
    return report;
  }

  private buildReportData(rd: any, userId: number) {
    return {
      acceptance_report_date: new Date(rd.report_date),
      acceptance_report_acceptance_date: new Date(rd.acceptance_date),
      acceptance_report_client_id: rd.client_id ? Number(rd.client_id) : null,
      acceptance_report_client_name: rd.client_name || '',
      acceptance_report_project_id: rd.project_id ? Number(rd.project_id) : null,
      acceptance_report_project_name: rd.project_name || '',
      acceptance_report_contract_ref: rd.contract_ref || null,
      acceptance_report_client_contract_no: rd.client_contract_no || null,
      acceptance_report_site_address: rd.site_address || '',
      acceptance_report_items: rd.acceptance_items || '',
      acceptance_report_quantity_unit: rd.quantity_unit || null,
      acceptance_report_mingtat_inspector_id: rd.mingtat_inspector_id ? Number(rd.mingtat_inspector_id) : null,
      acceptance_report_mingtat_inspector_name: rd.mingtat_inspector_name || null,
      acceptance_report_mingtat_inspector_title: rd.mingtat_inspector_title || '',
      acceptance_report_client_inspector_name: rd.client_inspector_name || '',
      acceptance_report_client_inspector_title: rd.client_inspector_title || '',
      acceptance_report_client_signature: rd.client_signature || null,
      acceptance_report_mingtat_signature: rd.mingtat_signature || null,
      acceptance_report_supplementary_notes: rd.supplementary_notes || null,
      acceptance_report_created_by: userId,
      acceptance_report_status: rd.status || 'draft',
      acceptance_report_submitted_at: rd.status === 'submitted' ? new Date() : null,
    };
  }

  async create(userId: number, dto: any) {
    const { attachments, acceptance_items_list, ...rd } = dto;
    const report = await this.prisma.acceptanceReport.create({
      data: {
        ...this.buildReportData(rd, userId),
        attachments: attachments?.length ? {
          create: attachments.map((att: any, idx: number) => ({
            acceptance_report_attachment_file_name: att.file_name,
            acceptance_report_attachment_file_url: att.file_url,
            acceptance_report_attachment_file_type: att.file_type,
            acceptance_report_attachment_sort_order: idx,
          })),
        } : undefined,
        acceptance_items: {
          create: (acceptance_items_list || []).map((item: any, idx: number) => ({
            acceptance_report_item_description: item.description || '',
            acceptance_report_item_quantity_unit: item.quantity_unit || null,
            acceptance_report_item_sort_order: idx,
          })),
        },
      },
      include: this.includeAll,
    });
    return report;
  }

  async update(id: number, userId: number, dto: any) {
    const existing = await this.prisma.acceptanceReport.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('收貨報告不存在');
    if (existing.acceptance_report_status === 'submitted') {
      throw new BadRequestException('已提交的收貨報告不可修改');
    }

    const { attachments, acceptance_items_list, ...rd } = dto;

    // Delete existing attachments and items, then recreate
    await this.prisma.acceptanceReportAttachment.deleteMany({
      where: { acceptance_report_attachment_report_id: id },
    });
    await this.prisma.acceptanceReportItem.deleteMany({
      where: { acceptance_report_item_report_id: id },
    });

    const data: any = { ...this.buildReportData(rd, userId) };
    delete data.acceptance_report_created_by; // Don't change creator on update

    if (attachments?.length) {
      data.attachments = {
        create: attachments.map((att: any, idx: number) => ({
          acceptance_report_attachment_file_name: att.file_name,
          acceptance_report_attachment_file_url: att.file_url,
          acceptance_report_attachment_file_type: att.file_type,
          acceptance_report_attachment_sort_order: idx,
        })),
      };
    }

    data.acceptance_items = {
      create: (acceptance_items_list || []).map((item: any, idx: number) => ({
        acceptance_report_item_description: item.description || '',
        acceptance_report_item_quantity_unit: item.quantity_unit || null,
        acceptance_report_item_sort_order: idx,
      })),
    };

    const report = await this.prisma.acceptanceReport.update({
      where: { id },
      data,
      include: this.includeAll,
    });
    return report;
  }

  async remove(id: number) {
    const existing = await this.prisma.acceptanceReport.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('收貨報告不存在');
    if (existing.acceptance_report_status === 'submitted') {
      throw new BadRequestException('已提交的收貨報告不可刪除');
    }
    await this.prisma.acceptanceReport.delete({ where: { id } });
    return { success: true };
  }

  async findByProject(projectId: number, query?: any) {
    const page = Number(query?.page) || 1;
    const limit = Number(query?.limit) || 50;
    const where = { acceptance_report_project_id: projectId };

    const [data, total] = await Promise.all([
      this.prisma.acceptanceReport.findMany({
        where,
        include: {
          inspector: { select: { id: true, name_zh: true, name_en: true } },
          creator: { select: { id: true, displayName: true } },
          attachments: { orderBy: { acceptance_report_attachment_sort_order: 'asc' } },
          acceptance_items: { orderBy: { acceptance_report_item_sort_order: 'asc' } },
        },
        orderBy: { acceptance_report_date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.acceptanceReport.count({ where }),
    ]);
    return { data, total, page, limit };
  }
}
