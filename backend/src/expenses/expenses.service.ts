import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PrismaService } from '../prisma/prisma.service';

const EXPENSE_INCLUDE = {
  company: true,
  supplier: true,
  category: { include: { parent: true } },
  employee: true,
  machinery: true,
  client: true,
  project: true,
  quotation: true,
  items: { orderBy: { sort_order: 'asc' as const } },
  attachments: { orderBy: { uploaded_at: 'asc' as const } },
};

// Valid expense source types
export const EXPENSE_SOURCES = ['MANUAL', 'PURCHASE', 'PAYROLL', 'SUBCON', 'CONTRA'] as const;
export type ExpenseSource = typeof EXPENSE_SOURCES[number];

@Injectable()
export class ExpensesService {
  constructor(
    private prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async findAll(query: {
    page?: number;
    limit?: number;
    search?: string;
    company_id?: number;
    category_id?: number;
    employee_id?: number;
    project_id?: number;
    is_paid?: string;
    source?: string;
    sortBy?: string;
    sortOrder?: string;
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const where: any = { deleted_at: null };

    if (query.company_id) where.company_id = Number(query.company_id);
    if (query.category_id) where.category_id = Number(query.category_id);
    if (query.employee_id) where.employee_id = Number(query.employee_id);
    if (query.project_id) where.project_id = Number(query.project_id);
    if (query.is_paid !== undefined && query.is_paid !== '') {
      where.is_paid = query.is_paid === 'true';
    }
    // Phase 7: source filter
    if (query.source && query.source !== '') {
      where.source = query.source;
    }
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
      'employee_id', 'item', 'total_amount', 'is_paid',
      'payment_date', 'payment_ref', 'machine_code', 'created_at', 'source',
    ];
    const sortBy = allowedSortFields.includes(query.sortBy || '') ? query.sortBy! : 'date';
    const sortOrder = query.sortOrder?.toUpperCase() === 'ASC' ? 'asc' : 'desc';

    const [data, total] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        include: EXPENSE_INCLUDE,
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
      include: EXPENSE_INCLUDE,
    });
    if (!expense) throw new NotFoundException('支出記錄不存在');
    return expense;
  }

  private normalizeDto(dto: any) {
    const { company, supplier, category, employee, machinery, client, project, quotation, items, attachments, ...data } = dto;
    if (data.date) data.date = new Date(data.date);
    if (data.payment_date === '') data.payment_date = null;
    else if (data.payment_date) data.payment_date = new Date(data.payment_date);

    const numericFields = ['company_id', 'supplier_partner_id', 'category_id', 'employee_id', 'machinery_id', 'client_id', 'project_id', 'quotation_id', 'contract_id', 'source_ref_id'];
    for (const f of numericFields) {
      if (f in data) {
        data[f] = data[f] ? Number(data[f]) : null;
      }
    }
    if ('total_amount' in data) data.total_amount = Number(data.total_amount) || 0;
    if ('is_paid' in data) data.is_paid = Boolean(data.is_paid);

    // Normalize source
    if ('source' in data) {
      if (!data.source || !EXPENSE_SOURCES.includes(data.source)) {
        data.source = 'MANUAL';
      }
    }

    return data;
  }

  async create(dto: any, userId?: number, ipAddress?: string) {
    const data = this.normalizeDto(dto);
    // Set default source if not provided
    if (!data.source) data.source = 'MANUAL';
    const saved = await this.prisma.expense.create({ data });
    if (userId) {
      try {
        await this.auditLogsService.log({
          userId,
          action: 'create',
          targetTable: 'expenses',
          targetId: saved.id,
          changesAfter: saved,
          ipAddress,
        });
      } catch (e) { console.error('Audit log error:', e); }
    }
    return this.findOne(saved.id);
  }

  async update(id: number, dto: any, userId?: number, ipAddress?: string) {
    const existing = await this.prisma.expense.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('支出記錄不存在');
    const { id: _id, created_at, updated_at, ...rest } = dto;
    const data = this.normalizeDto(rest);
    const updated = await this.prisma.expense.update({ where: { id }, data });
    if (userId) {
      try {
        await this.auditLogsService.log({
          userId,
          action: 'update',
          targetTable: 'expenses',
          targetId: id,
          changesBefore: existing,
          changesAfter: updated,
          ipAddress,
        });
      } catch (e) { console.error('Audit log error:', e); }
    }
    return this.findOne(id);
  }

  async remove(id: number, userId?: number, ipAddress?: string) {
    const existing = await this.prisma.expense.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('支出記錄不存在');
    if (userId) {
      try {
        await this.auditLogsService.log({
          userId,
          action: 'delete',
          targetTable: 'expenses',
          targetId: id,
          changesBefore: existing,
          ipAddress,
        });
      } catch (e) { console.error('Audit log error:', e); }
    }
    await this.prisma.expense.update({ where: { id }, data: { deleted_at: new Date() } });
    return { message: '刪除成功' };
  }

  // ── Bulk create expenses (for payroll auto-generation) ──────────
  async bulkCreate(expenses: any[]): Promise<number[]> {
    const createdIds: number[] = [];
    for (const dto of expenses) {
      const data = this.normalizeDto(dto);
      if (!data.source) data.source = 'MANUAL';
      const saved = await this.prisma.expense.create({ data });
      createdIds.push(saved.id);
    }
    return createdIds;
  }

  // ── Delete expenses by source ref ──────────────────────────────
  async deleteBySourceRef(source: string, sourceRefId: number): Promise<number> {
    const result = await this.prisma.expense.deleteMany({
      where: {
        source,
        source_ref_id: sourceRefId,
      },
    });
    return result.count;
  }

  // ── Check if expenses exist for a source ref ──────────────────
  async existsBySourceRef(source: string, sourceRefId: number): Promise<boolean> {
    const count = await this.prisma.expense.count({
      where: {
        source,
        source_ref_id: sourceRefId,
      },
    });
    return count > 0;
  }

  // ── Expense Items ──────────────────────────────────────────────

  async createItem(expenseId: number, dto: { description: string; quantity?: number; unit_price?: number; amount?: number }) {
    const expense = await this.prisma.expense.findUnique({ where: { id: expenseId } });
    if (!expense) throw new NotFoundException('支出記錄不存在');

    const qty = Number(dto.quantity) || 1;
    const unitPrice = Number(dto.unit_price) || 0;
    const amount = dto.amount !== undefined ? Number(dto.amount) : qty * unitPrice;

    const maxOrder = await this.prisma.expenseItem.aggregate({
      where: { expense_id: expenseId },
      _max: { sort_order: true },
    });

    const item = await this.prisma.expenseItem.create({
      data: {
        expense_id: expenseId,
        description: dto.description,
        quantity: qty,
        unit_price: unitPrice,
        amount,
        sort_order: (maxOrder._max.sort_order || 0) + 1,
      },
    });

    // Recalculate total_amount from items
    await this.recalcTotal(expenseId);
    return item;
  }

  async updateItem(expenseId: number, itemId: number, dto: any) {
    const item = await this.prisma.expenseItem.findFirst({ where: { id: itemId, expense_id: expenseId } });
    if (!item) throw new NotFoundException('細項不存在');

    const qty = dto.quantity !== undefined ? Number(dto.quantity) : Number(item.quantity);
    const unitPrice = dto.unit_price !== undefined ? Number(dto.unit_price) : Number(item.unit_price);
    const amount = dto.amount !== undefined ? Number(dto.amount) : qty * unitPrice;

    const updated = await this.prisma.expenseItem.update({
      where: { id: itemId },
      data: {
        description: dto.description ?? item.description,
        quantity: qty,
        unit_price: unitPrice,
        amount,
      },
    });

    await this.recalcTotal(expenseId);
    return updated;
  }

  async removeItem(expenseId: number, itemId: number) {
    const item = await this.prisma.expenseItem.findFirst({ where: { id: itemId, expense_id: expenseId } });
    if (!item) throw new NotFoundException('細項不存在');
    await this.prisma.expenseItem.delete({ where: { id: itemId } });
    await this.recalcTotal(expenseId);
    return { message: '刪除成功' };
  }

  private async recalcTotal(expenseId: number) {
    const agg = await this.prisma.expenseItem.aggregate({
      where: { expense_id: expenseId },
      _sum: { amount: true },
    });
    const total = Number(agg._sum.amount) || 0;
    await this.prisma.expense.update({
      where: { id: expenseId },
      data: { total_amount: total },
    });
  }

  // ── Expense Attachments ────────────────────────────────────────

  async createAttachment(expenseId: number, dto: { file_name: string; file_url: string; file_size?: number; mime_type?: string }) {
    const expense = await this.prisma.expense.findUnique({ where: { id: expenseId } });
    if (!expense) throw new NotFoundException('支出記錄不存在');
    return this.prisma.expenseAttachment.create({
      data: { expense_id: expenseId, ...dto },
    });
  }

  async removeAttachment(expenseId: number, attachmentId: number) {
    const att = await this.prisma.expenseAttachment.findFirst({ where: { id: attachmentId, expense_id: expenseId } });
    if (!att) throw new NotFoundException('附件不存在');
    await this.prisma.expenseAttachment.delete({ where: { id: attachmentId } });
    return { message: '刪除成功', file_url: att.file_url };
  }
}
