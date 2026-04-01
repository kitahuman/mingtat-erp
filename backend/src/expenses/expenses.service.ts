import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ExpensesService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: {
    page?: number;
    limit?: number;
    search?: string;
    company_id?: number;
    category_id?: number;
    employee_id?: number;
    project_id?: number;
    sortBy?: string;
    sortOrder?: string;
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const where: any = {};

    if (query.company_id) where.company_id = Number(query.company_id);
    if (query.category_id) where.category_id = Number(query.category_id);
    if (query.employee_id) where.employee_id = Number(query.employee_id);
    if (query.project_id) where.project_id = Number(query.project_id);
    if (query.search) {
      where.OR = [
        { item: { contains: query.search, mode: 'insensitive' } },
        { supplier_name: { contains: query.search, mode: 'insensitive' } },
        { payment_ref: { contains: query.search, mode: 'insensitive' } },
        { remarks: { contains: query.search, mode: 'insensitive' } },
        { machine_code: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const allowedSortFields = [
      'id', 'date', 'company_id', 'supplier_name', 'category_id',
      'employee_id', 'item', 'total_amount', 'paid_amount',
      'payment_date', 'payment_ref', 'machine_code', 'created_at',
    ];
    const sortBy = allowedSortFields.includes(query.sortBy || '') ? query.sortBy! : 'date';
    const sortOrder = query.sortOrder?.toUpperCase() === 'ASC' ? 'asc' : 'desc';

    const [data, total] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        include: {
          company: true,
          supplier: true,
          category: { include: { parent: true } },
          employee: true,
          machinery: true,
          client: true,
          project: true,
          quotation: true,
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.expense.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number) {
    const expense = await this.prisma.expense.findUnique({
      where: { id },
      include: {
        company: true,
        supplier: true,
        category: { include: { parent: true } },
        employee: true,
        machinery: true,
        client: true,
        project: true,
        quotation: true,
      },
    });
    if (!expense) throw new NotFoundException('支出記錄不存在');
    return expense;
  }

  async create(dto: any) {
    const { company, supplier, category, employee, machinery, client, project, quotation, ...data } = dto;
    if (data.date) data.date = new Date(data.date);
    if (data.payment_date) data.payment_date = new Date(data.payment_date);
    if (data.company_id) data.company_id = Number(data.company_id);
    if (data.supplier_partner_id) data.supplier_partner_id = Number(data.supplier_partner_id);
    if (data.category_id) data.category_id = Number(data.category_id);
    if (data.employee_id) data.employee_id = Number(data.employee_id);
    if (data.machinery_id) data.machinery_id = Number(data.machinery_id);
    if (data.client_id) data.client_id = Number(data.client_id);
    if (data.project_id) data.project_id = Number(data.project_id);
    if (data.quotation_id) data.quotation_id = Number(data.quotation_id);
    if (data.contract_id) data.contract_id = Number(data.contract_id);
    if (data.total_amount !== undefined) data.total_amount = Number(data.total_amount) || 0;
    if (data.paid_amount !== undefined) data.paid_amount = Number(data.paid_amount) || 0;

    const saved = await this.prisma.expense.create({ data });
    return this.findOne(saved.id);
  }

  async update(id: number, dto: any) {
    const existing = await this.prisma.expense.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('支出記錄不存在');

    const { company, supplier, category, employee, machinery, client, project, quotation, created_at, updated_at, id: _id, ...updateData } = dto;

    if (updateData.date) updateData.date = new Date(updateData.date);
    if (updateData.payment_date === '') updateData.payment_date = null;
    else if (updateData.payment_date) updateData.payment_date = new Date(updateData.payment_date);

    // Normalize numeric FKs – allow clearing with empty string / null
    const numericFields = ['company_id', 'supplier_partner_id', 'category_id', 'employee_id', 'machinery_id', 'client_id', 'project_id', 'quotation_id', 'contract_id'];
    for (const f of numericFields) {
      if (f in updateData) {
        updateData[f] = updateData[f] ? Number(updateData[f]) : null;
      }
    }

    if ('total_amount' in updateData) updateData.total_amount = Number(updateData.total_amount) || 0;
    if ('paid_amount' in updateData) updateData.paid_amount = Number(updateData.paid_amount) || 0;

    await this.prisma.expense.update({ where: { id }, data: updateData });
    return this.findOne(id);
  }

  async remove(id: number) {
    const existing = await this.prisma.expense.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('支出記錄不存在');
    await this.prisma.expense.delete({ where: { id } });
    return { message: '刪除成功' };
  }
}
