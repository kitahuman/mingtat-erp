import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AcceptanceReportsService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: any) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const where: any = {};

    if (query.project_id) where.acceptance_report_project_id = Number(query.project_id);
    if (query.client_id) where.acceptance_report_client_id = Number(query.client_id);
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
        { acceptance_report_items: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.acceptanceReport.findMany({
        where,
        include: {
          client: { select: { id: true, name: true } },
          project: { select: { id: true, project_no: true, project_name: true } },
          inspector: { select: { id: true, name_zh: true, name_en: true, emp_code: true } },
          creator: { select: { id: true, displayName: true } },
          attachments: { orderBy: { acceptance_report_attachment_sort_order: 'asc' } },
        },
        orderBy: { acceptance_report_date: 'desc' },
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
      include: {
        client: { select: { id: true, name: true } },
        project: { select: { id: true, project_no: true, project_name: true, address: true, client: { select: { id: true, name: true } }, contract: { select: { id: true, contract_no: true } } } },
        inspector: { select: { id: true, name_zh: true, name_en: true, emp_code: true } },
        creator: { select: { id: true, displayName: true } },
        attachments: { orderBy: { acceptance_report_attachment_sort_order: 'asc' } },
      },
    });
    if (!report) throw new NotFoundException('收貨報告不存在');
    return report;
  }

  async create(userId: number, dto: any) {
    const { attachments, ...reportData } = dto;
    const report = await this.prisma.acceptanceReport.create({
      data: {
        acceptance_report_date: new Date(reportData.report_date),
        acceptance_report_acceptance_date: new Date(reportData.acceptance_date),
        acceptance_report_client_id: reportData.client_id ? Number(reportData.client_id) : null,
        acceptance_report_client_name: reportData.client_name,
        acceptance_report_project_id: reportData.project_id ? Number(reportData.project_id) : null,
        acceptance_report_project_name: reportData.project_name,
        acceptance_report_contract_ref: reportData.contract_ref || null,
        acceptance_report_site_address: reportData.site_address,
        acceptance_report_items: reportData.acceptance_items,
        acceptance_report_quantity_unit: reportData.quantity_unit || null,
        acceptance_report_mingtat_inspector_id: Number(reportData.mingtat_inspector_id),
        acceptance_report_mingtat_inspector_title: reportData.mingtat_inspector_title,
        acceptance_report_client_inspector_name: reportData.client_inspector_name,
        acceptance_report_client_inspector_title: reportData.client_inspector_title,
        acceptance_report_client_signature: reportData.client_signature || null,
        acceptance_report_mingtat_signature: reportData.mingtat_signature || null,
        acceptance_report_supplementary_notes: reportData.supplementary_notes || null,
        acceptance_report_created_by: userId,
        acceptance_report_status: reportData.status || 'draft',
        acceptance_report_submitted_at: reportData.status === 'submitted' ? new Date() : null,
        attachments: attachments?.length ? {
          create: attachments.map((att: any, idx: number) => ({
            acceptance_report_attachment_file_name: att.file_name,
            acceptance_report_attachment_file_url: att.file_url,
            acceptance_report_attachment_file_type: att.file_type,
            acceptance_report_attachment_sort_order: idx,
          })),
        } : undefined,
      },
      include: {
        project: { select: { id: true, project_no: true, project_name: true } },
        attachments: { orderBy: { acceptance_report_attachment_sort_order: 'asc' } },
      },
    });
    return report;
  }

  async update(id: number, userId: number, dto: any) {
    const existing = await this.prisma.acceptanceReport.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('收貨報告不存在');
    if (existing.acceptance_report_status === 'submitted') {
      throw new BadRequestException('已提交的收貨報告不可修改');
    }

    const { attachments, ...reportData } = dto;

    // Delete existing attachments and recreate
    await this.prisma.acceptanceReportAttachment.deleteMany({
      where: { acceptance_report_attachment_report_id: id },
    });

    const report = await this.prisma.acceptanceReport.update({
      where: { id },
      data: {
        acceptance_report_date: new Date(reportData.report_date),
        acceptance_report_acceptance_date: new Date(reportData.acceptance_date),
        acceptance_report_client_id: reportData.client_id ? Number(reportData.client_id) : null,
        acceptance_report_client_name: reportData.client_name,
        acceptance_report_project_id: reportData.project_id ? Number(reportData.project_id) : null,
        acceptance_report_project_name: reportData.project_name,
        acceptance_report_contract_ref: reportData.contract_ref || null,
        acceptance_report_site_address: reportData.site_address,
        acceptance_report_items: reportData.acceptance_items,
        acceptance_report_quantity_unit: reportData.quantity_unit || null,
        acceptance_report_mingtat_inspector_id: Number(reportData.mingtat_inspector_id),
        acceptance_report_mingtat_inspector_title: reportData.mingtat_inspector_title,
        acceptance_report_client_inspector_name: reportData.client_inspector_name,
        acceptance_report_client_inspector_title: reportData.client_inspector_title,
        acceptance_report_client_signature: reportData.client_signature || null,
        acceptance_report_mingtat_signature: reportData.mingtat_signature || null,
        acceptance_report_supplementary_notes: reportData.supplementary_notes || null,
        acceptance_report_status: reportData.status || 'draft',
        acceptance_report_submitted_at: reportData.status === 'submitted' ? new Date() : null,
        attachments: attachments?.length ? {
          create: attachments.map((att: any, idx: number) => ({
            acceptance_report_attachment_file_name: att.file_name,
            acceptance_report_attachment_file_url: att.file_url,
            acceptance_report_attachment_file_type: att.file_type,
            acceptance_report_attachment_sort_order: idx,
          })),
        } : undefined,
      },
      include: {
        project: { select: { id: true, project_no: true, project_name: true } },
        attachments: { orderBy: { acceptance_report_attachment_sort_order: 'asc' } },
      },
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
