import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PrismaService } from '../prisma/prisma.service';
import { PettyCashService } from '../petty-cash/petty-cash.service';

const EXPENSE_INCLUDE = {
  company: true,
  supplier: true,
  creator: { select: { id: true, displayName: true, username: true } },
  category: { include: { parent: true } },
  employee: true,
  machinery: true,
  vehicle: true,
  client: true,
  project: true,
  quotation: true,
  items: { orderBy: { sort_order: 'asc' as const } },
  attachments: { orderBy: { uploaded_at: 'asc' as const } },
  payment_outs: {
    include: {
      bank_account: { select: { id: true, account_name: true, bank_name: true, account_no: true } },
    },
    orderBy: { date: 'desc' as const },
  },
};

// Valid expense source types
export const EXPENSE_SOURCES = ['MANUAL', 'PURCHASE', 'PAYROLL', 'SUBCON', 'CONTRA', 'ERP'] as const;
export type ExpenseSource = typeof EXPENSE_SOURCES[number];

type ExpenseOtherCharge = { name: string; amount: number };

type ExpenseListQuery = {
  page?: number | string;
  limit?: number | string;
  search?: string;
  company_id?: number | string;
  category_id?: number | string;
  employee_id?: number | string;
  project_id?: number | string;
  is_paid?: string;
  payment_status?: string;
  source?: string;
  expense_payment_method?: string;
  sortBy?: string;
  sortOrder?: string;
  [key: string]: string | number | undefined;
};

type ColumnFilters = Record<string, string[]>;

const PAYMENT_STATUS_LABEL_TO_VALUE: Record<string, string> = {
  未付款: 'unpaid',
  部分付款: 'partially_paid',
  已付款: 'paid',
  取消: 'cancelled',
  unpaid: 'unpaid',
  partially_paid: 'partially_paid',
  paid: 'paid',
  cancelled: 'cancelled',
};

const PAYMENT_STATUS_VALUE_TO_LABEL: Record<string, string> = {
  unpaid: '未付款',
  partially_paid: '部分付款',
  paid: '已付款',
  cancelled: '取消',
};

const EXPENSE_PAYMENT_METHOD_LABEL_TO_VALUE: Record<string, string> = {
  本人代付: 'SELF_PAID',
  公司付款: 'COMPANY_PAID',
  SELF_PAID: 'SELF_PAID',
  COMPANY_PAID: 'COMPANY_PAID',
};

const EXPENSE_PAYMENT_METHOD_VALUE_TO_LABEL: Record<string, string> = {
  SELF_PAID: '本人代付',
  COMPANY_PAID: '公司付款',
};

const SOURCE_LABEL_TO_VALUE: Record<string, string> = {
  手動輸入: 'MANUAL',
  採購: 'PURCHASE',
  薪資: 'PAYROLL',
  分判: 'SUBCON',
  對沖: 'CONTRA',
  ERP: 'ERP',
  員工報銷: 'employee_portal',
  MANUAL: 'MANUAL',
  PURCHASE: 'PURCHASE',
  PAYROLL: 'PAYROLL',
  SUBCON: 'SUBCON',
  CONTRA: 'CONTRA',
  employee_portal: 'employee_portal',
};

const SOURCE_VALUE_TO_LABEL: Record<string, string> = {
  MANUAL: '手動輸入',
  PURCHASE: '採購',
  PAYROLL: '薪資',
  SUBCON: '分判',
  CONTRA: '對沖',
  ERP: 'ERP',
  employee_portal: '員工報銷',
};

@Injectable()
export class ExpensesService {
  constructor(
    private prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly pettyCashService: PettyCashService,
  ) {}

  private roundMoney(value: number) {
    return Math.round(value * 100) / 100;
  }

  private normalizeOtherCharges(value: unknown): ExpenseOtherCharge[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((charge) => {
        if (!charge || typeof charge !== 'object') return null;
        const item = charge as Record<string, unknown>;
        const name = String(item.name || '').trim();
        const amount = Number(item.amount) || 0;
        if (!name) return null;
        return { name, amount };
      })
      .filter((charge): charge is ExpenseOtherCharge => charge !== null);
  }

  private otherChargesTotal(otherCharges: ExpenseOtherCharge[]) {
    return otherCharges.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
  }

  private toNullableJson(
    value: unknown,
  ): Prisma.InputJsonValue | typeof Prisma.JsonNull {
    if (value === null || value === undefined) return Prisma.JsonNull;
    return value as Prisma.InputJsonValue;
  }

  private calculateItemsSubtotal(items: any[]) {
    return this.roundMoney(
      items.reduce((sum, item) => {
        if (item.amount !== undefined && item.amount !== null && item.amount !== '') {
          return sum + (Number(item.amount) || 0);
        }
        return (
          sum +
          (Number(item.quantity) || 0) * (Number(item.unit_price) || 0)
        );
      }, 0),
    );
  }

  private async getPersistedItemsSubtotal(expenseId: number) {
    const [agg, count] = await Promise.all([
      this.prisma.expenseItem.aggregate({
        where: { expense_id: expenseId },
        _sum: { amount: true },
      }),
      this.prisma.expenseItem.count({ where: { expense_id: expenseId } }),
    ]);
    return {
      subtotal: this.roundMoney(Number(agg._sum.amount) || 0),
      hasItems: count > 0,
    };
  }

  private async applyOtherChargesTotal(
    data: any,
    expenseId?: number,
    existing?: { total_amount?: unknown; other_charges?: unknown },
  ) {
    const hasOtherChargesInput = Object.prototype.hasOwnProperty.call(
      data,
      'other_charges',
    );
    const otherCharges = hasOtherChargesInput
      ? this.normalizeOtherCharges(data.other_charges)
      : this.normalizeOtherCharges(existing?.other_charges);

    if (hasOtherChargesInput) {
      data.other_charges = otherCharges.length > 0
        ? this.toNullableJson(otherCharges)
        : Prisma.JsonNull;
    }

    let subtotal: number;
    if (Array.isArray(data.items)) {
      subtotal = this.calculateItemsSubtotal(data.items);
    } else if (expenseId) {
      const persistedItems = await this.getPersistedItemsSubtotal(expenseId);
      if (persistedItems.hasItems) {
        subtotal = persistedItems.subtotal;
      } else if (Object.prototype.hasOwnProperty.call(data, 'total_amount')) {
        subtotal = Number(data.total_amount) || 0;
      } else {
        const existingTotal = Number(existing?.total_amount) || 0;
        const existingOtherTotal = this.otherChargesTotal(
          this.normalizeOtherCharges(existing?.other_charges),
        );
        subtotal = existingTotal - existingOtherTotal;
      }
    } else {
      subtotal = Number(data.total_amount) || 0;
    }

    data.total_amount = this.roundMoney(
      subtotal + this.otherChargesTotal(otherCharges),
    );
  }

  private parseColumnFilters(query: ExpenseListQuery): ColumnFilters {
    const filters: ColumnFilters = {};
    for (const key of Object.keys(query)) {
      if (!key.startsWith('filter_') || query[key] === undefined || query[key] === '') continue;
      const field = key.replace('filter_', '');
      const rawValue = String(query[key]);
      let values: string[];
      try {
        const parsed = JSON.parse(rawValue);
        values = Array.isArray(parsed)
          ? parsed.map((value) => String(value).trim()).filter(Boolean)
          : rawValue.split(',').map((value) => value.trim()).filter(Boolean);
      } catch {
        values = rawValue.split(',').map((value) => value.trim()).filter(Boolean);
      }
      if (values.length > 0) filters[field] = values;
    }
    return filters;
  }

  private parseDisplayDate(dateStr: string): { start: Date; end: Date } | null {
    const displayMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (displayMatch) {
      const day = Number(displayMatch[1]);
      const month = Number(displayMatch[2]);
      const year = Number(displayMatch[3]);
      if (!day || !month || !year) return null;
      return {
        start: new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0)),
        end: new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0, 0)),
      };
    }

    const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      const year = Number(isoMatch[1]);
      const month = Number(isoMatch[2]);
      const day = Number(isoMatch[3]);
      return {
        start: new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0)),
        end: new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0, 0)),
      };
    }

    return null;
  }

  private formatDisplayDate(date: Date | null | undefined): string {
    if (!date) return '-';
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const year = date.getUTCFullYear();
    return `${day}/${month}/${year}`;
  }

  private formatAmount(value: any): string {
    return value != null ? Number(value).toLocaleString('en', { minimumFractionDigits: 2 }) : '-';
  }

  private addFieldConditions(target: Prisma.ExpenseWhereInput[], fieldConditions: Prisma.ExpenseWhereInput[]) {
    if (fieldConditions.length === 1) target.push(fieldConditions[0]);
    if (fieldConditions.length > 1) target.push({ OR: fieldConditions });
  }

  private buildColumnFilterWhere(filters: ColumnFilters): Prisma.ExpenseWhereInput {
    const conditions: Prisma.ExpenseWhereInput[] = [];
    const nullableStringFields = [
      'expense_receipt_number', 'item', 'payment_method', 'payment_ref', 'remarks', 'machine_code',
    ];
    const directNumberFields = ['id', 'contract_id'];

    for (const [field, values] of Object.entries(filters)) {
      if (values.includes('__NO_MATCH__')) {
        conditions.push({ id: -1 });
        continue;
      }

      const hasBlank = values.includes('-');
      const nonBlankValues = values.filter((value) => value !== '-');

      if (nullableStringFields.includes(field)) {
        const fieldConditions: Prisma.ExpenseWhereInput[] = [];
        if (nonBlankValues.length > 0) fieldConditions.push({ [field]: { in: nonBlankValues } } as Prisma.ExpenseWhereInput);
        if (hasBlank) fieldConditions.push({ OR: [{ [field]: null }, { [field]: '' }] } as Prisma.ExpenseWhereInput);
        this.addFieldConditions(conditions, fieldConditions);
      } else if (directNumberFields.includes(field)) {
        const numericValues = nonBlankValues.map((value) => Number(value)).filter((value) => Number.isFinite(value));
        const fieldConditions: Prisma.ExpenseWhereInput[] = [];
        if (numericValues.length > 0) fieldConditions.push({ [field]: { in: numericValues } } as Prisma.ExpenseWhereInput);
        if (hasBlank) fieldConditions.push({ [field]: null } as Prisma.ExpenseWhereInput);
        this.addFieldConditions(conditions, fieldConditions);
      } else if (field === 'date' || field === 'payment_date') {
        const dateRanges = nonBlankValues
          .map((value) => this.parseDisplayDate(value))
          .filter((range): range is { start: Date; end: Date } => range !== null);
        const fieldConditions: Prisma.ExpenseWhereInput[] = [];
        if (dateRanges.length > 0) {
          fieldConditions.push({
            OR: dateRanges.map((range) => ({ [field]: { gte: range.start, lt: range.end } }) as Prisma.ExpenseWhereInput),
          });
        }
        if (hasBlank) fieldConditions.push({ [field]: null } as Prisma.ExpenseWhereInput);
        this.addFieldConditions(conditions, fieldConditions);
      } else if (field === 'total_amount') {
        const amountValues = nonBlankValues
          .map((value) => Number(value.replace(/,/g, '')))
          .filter((value) => Number.isFinite(value));
        if (amountValues.length > 0) conditions.push({ total_amount: { in: amountValues } as any });
      } else if (field === 'payment_status') {
        const rawValues = nonBlankValues.map((value) => PAYMENT_STATUS_LABEL_TO_VALUE[value] || value);
        if (rawValues.length > 0) conditions.push({ payment_status: { in: rawValues } });
      } else if (field === 'expense_payment_method') {
        const rawValues = nonBlankValues.map((value) => EXPENSE_PAYMENT_METHOD_LABEL_TO_VALUE[value] || value);
        if (rawValues.length > 0) conditions.push({ expense_payment_method: { in: rawValues } });
      } else if (field === 'source') {
        const rawValues = nonBlankValues.map((value) => SOURCE_LABEL_TO_VALUE[value] || value);
        const fieldConditions: Prisma.ExpenseWhereInput[] = [];
        if (rawValues.length > 0) fieldConditions.push({ source: { in: rawValues } });
        if (hasBlank) fieldConditions.push({ OR: [{ source: null }, { source: '' }] } as Prisma.ExpenseWhereInput);
        this.addFieldConditions(conditions, fieldConditions);
      } else if (field === 'company_id') {
        const fieldConditions: Prisma.ExpenseWhereInput[] = [];
        if (nonBlankValues.length > 0) {
          fieldConditions.push({ company: { is: { OR: [{ internal_prefix: { in: nonBlankValues } }, { name: { in: nonBlankValues } }] } } });
        }
        if (hasBlank) fieldConditions.push({ company_id: null });
        this.addFieldConditions(conditions, fieldConditions);
      } else if (field === 'supplier_name') {
        const fieldConditions: Prisma.ExpenseWhereInput[] = [];
        if (nonBlankValues.length > 0) {
          fieldConditions.push({ supplier: { is: { name: { in: nonBlankValues } } } });
          fieldConditions.push({ supplier_name: { in: nonBlankValues } });
        }
        if (hasBlank) fieldConditions.push({ AND: [{ supplier_partner_id: null }, { OR: [{ supplier_name: null }, { supplier_name: '' }] }] });
        this.addFieldConditions(conditions, fieldConditions);
      } else if (field === 'category_id') {
        const fieldConditions: Prisma.ExpenseWhereInput[] = [];
        for (const value of nonBlankValues) {
          const [parentName, childName] = value.split(' > ').map((part) => part.trim());
          if (childName) {
            fieldConditions.push({ category: { is: { name: childName, parent: { is: { name: parentName } } } } });
          } else {
            fieldConditions.push({ category: { is: { name: parentName } } });
          }
        }
        if (hasBlank) fieldConditions.push({ category_id: null });
        this.addFieldConditions(conditions, fieldConditions);
      } else if (field === 'employee_id') {
        const fieldConditions: Prisma.ExpenseWhereInput[] = [];
        if (nonBlankValues.length > 0) fieldConditions.push({ employee: { is: { name_zh: { in: nonBlankValues } } } });
        if (hasBlank) fieldConditions.push({ employee_id: null });
        this.addFieldConditions(conditions, fieldConditions);
      } else if (field === 'created_by') {
        const fieldConditions: Prisma.ExpenseWhereInput[] = [];
        if (nonBlankValues.length > 0) {
          fieldConditions.push({ creator: { is: { OR: [{ displayName: { in: nonBlankValues } }, { username: { in: nonBlankValues } }] } } });
        }
        if (hasBlank) fieldConditions.push({ created_by: null });
        this.addFieldConditions(conditions, fieldConditions);
      } else if (field === 'machinery_id') {
        const fieldConditions: Prisma.ExpenseWhereInput[] = [];
        if (nonBlankValues.length > 0) {
          fieldConditions.push({ vehicle: { is: { plate_number: { in: nonBlankValues } } } });
          fieldConditions.push({ machinery: { is: { machine_code: { in: nonBlankValues } } } });
          fieldConditions.push({ machine_code: { in: nonBlankValues } });
        }
        if (hasBlank) {
          fieldConditions.push({
            AND: [
              { vehicle_id: null },
              { machinery_id: null },
              { OR: [{ machine_code: null }, { machine_code: '' }] },
            ],
          });
        }
        this.addFieldConditions(conditions, fieldConditions);
      } else if (field === 'client_id') {
        const fieldConditions: Prisma.ExpenseWhereInput[] = [];
        if (nonBlankValues.length > 0) fieldConditions.push({ client: { is: { name: { in: nonBlankValues } } } });
        if (hasBlank) fieldConditions.push({ client_id: null });
        this.addFieldConditions(conditions, fieldConditions);
      } else if (field === 'project_id') {
        const fieldConditions: Prisma.ExpenseWhereInput[] = [];
        if (nonBlankValues.length > 0) fieldConditions.push({ project: { is: { project_no: { in: nonBlankValues } } } });
        if (hasBlank) fieldConditions.push({ project_id: null });
        this.addFieldConditions(conditions, fieldConditions);
      } else if (field === 'quotation_id') {
        const fieldConditions: Prisma.ExpenseWhereInput[] = [];
        if (nonBlankValues.length > 0) fieldConditions.push({ quotation: { is: { quotation_no: { in: nonBlankValues } } } });
        if (hasBlank) fieldConditions.push({ quotation_id: null });
        this.addFieldConditions(conditions, fieldConditions);
      }
    }

    return conditions.length > 0 ? { AND: conditions } : {};
  }

  private buildBaseWhere(query: ExpenseListQuery, excludeFilterColumn?: string): Prisma.ExpenseWhereInput {
    const where: Prisma.ExpenseWhereInput = { deleted_at: null };

    if (query.company_id) where.company_id = Number(query.company_id);
    if (query.category_id) where.category_id = Number(query.category_id);
    if (query.employee_id) where.employee_id = Number(query.employee_id);
    if (query.project_id) where.project_id = Number(query.project_id);
    if (query.is_paid !== undefined && query.is_paid !== '') {
      where.is_paid = query.is_paid === 'true';
    }
    if (query.payment_status && query.payment_status !== '') {
      where.payment_status = query.payment_status;
    }
    if (query.source && query.source !== '') {
      where.source = query.source;
    }
    if (query.expense_payment_method && query.expense_payment_method !== '') {
      where.expense_payment_method = query.expense_payment_method;
    }
    if (query.search) {
      where.OR = [
        { item: { contains: query.search, mode: 'insensitive' } },
        { supplier_name: { contains: query.search, mode: 'insensitive' } },
        { supplier: { is: { name: { contains: query.search, mode: 'insensitive' } } } },
        { expense_receipt_number: { contains: query.search, mode: 'insensitive' } },
        { payment_ref: { contains: query.search, mode: 'insensitive' } },
        { remarks: { contains: query.search, mode: 'insensitive' } },
        { machine_code: { contains: query.search, mode: 'insensitive' } },
        { machinery: { is: { machine_code: { contains: query.search, mode: 'insensitive' } } } },
        { vehicle: { is: { plate_number: { contains: query.search, mode: 'insensitive' } } } },
      ];
    }

    const columnFilters = this.parseColumnFilters(query);
    if (excludeFilterColumn) delete columnFilters[excludeFilterColumn];
    const columnFilterWhere = this.buildColumnFilterWhere(columnFilters);
    if (Array.isArray(columnFilterWhere.AND) && columnFilterWhere.AND.length > 0) {
      where.AND = [...(Array.isArray(where.AND) ? where.AND : []), ...columnFilterWhere.AND];
    }

    return where;
  }

  private buildOrderBy(sortBy: string | undefined, sortOrder: Prisma.SortOrder): Prisma.ExpenseOrderByWithRelationInput {
    const directSortFields = [
      'id', 'date', 'company_id', 'supplier_name', 'expense_receipt_number', 'category_id',
      'employee_id', 'item', 'total_amount', 'is_paid', 'payment_status', 'payment_method',
      'payment_date', 'payment_ref', 'machine_code', 'created_at', 'created_by', 'source',
      'expense_payment_method', 'client_id', 'contract_id', 'project_id', 'quotation_id',
    ];
    if (directSortFields.includes(sortBy || '')) return { [sortBy!]: sortOrder } as Prisma.ExpenseOrderByWithRelationInput;
    return { date: 'desc' };
  }

  async findAll(query: ExpenseListQuery) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const where = this.buildBaseWhere(query);
    const sortOrder: Prisma.SortOrder = query.sortOrder?.toUpperCase() === 'ASC' ? 'asc' : 'desc';
    const orderBy = this.buildOrderBy(query.sortBy, sortOrder);

    const [data, total] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        include: EXPENSE_INCLUDE,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.expense.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getFilterOptions(column: string, query: ExpenseListQuery): Promise<string[]> {
    const where = this.buildBaseWhere(query, column);
    const stringColumns = [
      'expense_receipt_number', 'item', 'payment_method', 'payment_ref', 'remarks', 'machine_code', 'source',
    ];
    const dateColumns = ['date', 'payment_date'];

    if (stringColumns.includes(column)) {
      const records = await this.prisma.expense.findMany({
        where,
        select: { [column]: true } as any,
        distinct: [column as any],
        orderBy: { [column]: 'asc' } as any,
      });
      const values = records.map((record: any) => {
        const value = record[column];
        if (column === 'source') return SOURCE_VALUE_TO_LABEL[value] || value || '-';
        return value || '-';
      });
      return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    }

    if (column === 'id' || column === 'contract_id') {
      const records = await this.prisma.expense.findMany({
        where,
        select: { [column]: true } as any,
        distinct: [column as any],
        orderBy: { [column]: 'asc' } as any,
      });
      return records.map((record: any) => (record[column] == null ? '-' : String(record[column])));
    }

    if (dateColumns.includes(column)) {
      const records = await this.prisma.expense.findMany({
        where,
        select: { [column]: true } as any,
        orderBy: { [column]: 'desc' } as any,
      });
      const values = records.map((record: any) => this.formatDisplayDate(record[column]));
      return [...new Set(values)];
    }

    if (column === 'total_amount') {
      const records = await this.prisma.expense.findMany({
        where,
        select: { total_amount: true },
        distinct: ['total_amount'],
        orderBy: { total_amount: 'asc' },
      });
      return records.map((record) => this.formatAmount(record.total_amount));
    }

    if (column === 'payment_status') {
      const records = await this.prisma.expense.findMany({
        where,
        select: { payment_status: true },
        distinct: ['payment_status'],
        orderBy: { payment_status: 'asc' },
      });
      const values = records.map((record) => PAYMENT_STATUS_VALUE_TO_LABEL[record.payment_status] || record.payment_status || '-');
      return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    }

    if (column === 'expense_payment_method') {
      const records = await this.prisma.expense.findMany({
        where,
        select: { expense_payment_method: true },
        distinct: ['expense_payment_method'],
        orderBy: { expense_payment_method: 'asc' },
      });
      const values = records.map((record) => EXPENSE_PAYMENT_METHOD_VALUE_TO_LABEL[record.expense_payment_method] || record.expense_payment_method || '本人代付');
      return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    }

    if (column === 'company_id') {
      const records = await this.prisma.expense.findMany({
        where,
        include: { company: { select: { internal_prefix: true, name: true } } },
        distinct: ['company_id'],
      });
      const values = records.map((record) => record.company?.internal_prefix || record.company?.name || '-');
      return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    }

    if (column === 'supplier_name') {
      const records = await this.prisma.expense.findMany({
        where,
        include: { supplier: { select: { name: true } } },
      });
      const values = records.map((record) => record.supplier?.name || record.supplier_name || '-');
      return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    }

    if (column === 'category_id') {
      const records = await this.prisma.expense.findMany({
        where,
        include: { category: { include: { parent: true } } },
        distinct: ['category_id'],
      });
      const values = records.map((record) => {
        if (!record.category) return '-';
        const parent = record.category.parent?.name || '';
        return parent ? `${parent} > ${record.category.name}` : record.category.name;
      });
      return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    }

    if (column === 'employee_id') {
      const records = await this.prisma.expense.findMany({
        where,
        include: { employee: { select: { name_zh: true } } },
        distinct: ['employee_id'],
      });
      const values = records.map((record) => record.employee?.name_zh || '-');
      return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    }

    if (column === 'created_by') {
      const records = await this.prisma.expense.findMany({
        where,
        include: { creator: { select: { displayName: true, username: true } } },
        distinct: ['created_by'],
      });
      const values = records.map((record) => record.creator?.displayName || record.creator?.username || '-');
      return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    }

    if (column === 'machinery_id') {
      const records = await this.prisma.expense.findMany({
        where,
        include: {
          machinery: { select: { machine_code: true } },
          vehicle: { select: { plate_number: true } },
        },
      });
      const values = records.map((record) => record.vehicle?.plate_number || record.machinery?.machine_code || record.machine_code || '-');
      return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    }

    if (column === 'client_id') {
      const records = await this.prisma.expense.findMany({
        where,
        include: { client: { select: { name: true } } },
        distinct: ['client_id'],
      });
      const values = records.map((record) => record.client?.name || '-');
      return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    }

    if (column === 'project_id') {
      const records = await this.prisma.expense.findMany({
        where,
        include: { project: { select: { project_no: true } } },
        distinct: ['project_id'],
      });
      const values = records.map((record) => record.project?.project_no || '-');
      return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    }

    if (column === 'quotation_id') {
      const records = await this.prisma.expense.findMany({
        where,
        include: { quotation: { select: { quotation_no: true } } },
        distinct: ['quotation_id'],
      });
      const values = records.map((record) => record.quotation?.quotation_no || '-');
      return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    }

    return [];
  }

  async findOne(id: number) {
    const expense = await this.prisma.expense.findUnique({
      where: { id },
      include: EXPENSE_INCLUDE,
    });
    if (!expense) throw new NotFoundException('支出記錄不存在');
    return expense;
  }

  private async assertVehicleIsNotScrappedByExpenseData(data: any) {
    const vehicleId = data.vehicle_id ? Number(data.vehicle_id) : null;
    const machineCode = data.machine_code ? String(data.machine_code) : null;
    if (!vehicleId && !machineCode) return;
    const vehicle = await this.prisma.vehicle.findFirst({
      where: vehicleId ? { id: vehicleId } : { plate_number: machineCode as string },
      select: { id: true, plate_number: true, status: true },
    });
    if (vehicle?.status === 'scrapped') {
      throw new BadRequestException(`已劏車的車輛${vehicle.plate_number ? `（${vehicle.plate_number}）` : ''}不能新增或更新費用`);
    }
  }

  private normalizeDto(dto: any) {
    const { company, supplier, category, employee, machinery, client, project, quotation, items, attachments, ...data } = dto;
    if (data.date) data.date = new Date(data.date);
    if (data.payment_date === '') data.payment_date = null;
    else if (data.payment_date) data.payment_date = new Date(data.payment_date);

    const numericFields = ['company_id', 'supplier_partner_id', 'category_id', 'employee_id', 'machinery_id', 'vehicle_id', 'client_id', 'project_id', 'quotation_id', 'contract_id', 'source_ref_id'];
    for (const f of numericFields) {
      if (f in data) {
        data[f] = data[f] ? Number(data[f]) : null;
      }
    }
    if ('total_amount' in data) data.total_amount = Number(data.total_amount) || 0;
    if ('is_paid' in data) data.is_paid = Boolean(data.is_paid);

    if ('receipt_no' in data && !data.expense_receipt_number) {
      data.expense_receipt_number = data.receipt_no;
    }
    delete data.receipt_no;

    if ('supplier_name' in data) {
      data.supplier_name = typeof data.supplier_name === 'string' && data.supplier_name.trim()
        ? data.supplier_name.trim()
        : null;
    }
    if ('expense_receipt_number' in data) {
      data.expense_receipt_number = typeof data.expense_receipt_number === 'string' && data.expense_receipt_number.trim()
        ? data.expense_receipt_number.trim()
        : null;
    }

    // Normalize source
    if ('source' in data) {
      if (!data.source || !EXPENSE_SOURCES.includes(data.source)) {
        data.source = 'MANUAL';
      }
    }

    return data;
  }

  private async ensureSupplierPartner(data: any) {
    if (!('supplier_name' in data) && !('supplier_partner_id' in data)) return;

    const supplierName = typeof data.supplier_name === 'string' ? data.supplier_name.trim() : '';

    if (data.supplier_partner_id) {
      const supplier = await this.prisma.partner.findFirst({
        where: { id: Number(data.supplier_partner_id), deleted_at: null },
        select: { id: true, name: true },
      });
      if (supplier) {
        data.supplier_partner_id = supplier.id;
        data.supplier_name = supplier.name;
      }
      return;
    }

    if (!supplierName) {
      data.supplier_name = null;
      data.supplier_partner_id = null;
      return;
    }

    let supplier = await this.prisma.partner.findFirst({
      where: {
        name: { equals: supplierName, mode: 'insensitive' },
        partner_type: 'supplier',
        deleted_at: null,
      },
      select: { id: true, name: true },
    });

    if (!supplier) {
      supplier = await this.prisma.partner.create({
        data: {
          name: supplierName,
          partner_type: 'supplier',
          status: 'active',
        },
        select: { id: true, name: true },
      });
    }

    data.supplier_partner_id = supplier.id;
    data.supplier_name = supplier.name;
  }

  async create(dto: any, userId?: number, ipAddress?: string) {
    const data = this.normalizeDto(dto);
    await this.assertVehicleIsNotScrappedByExpenseData(data);
    await this.ensureSupplierPartner(data);
    if (Object.prototype.hasOwnProperty.call(data, 'other_charges')) {
      await this.applyOtherChargesTotal(data);
    }
    // Set default source if not provided
    if (!data.source) data.source = 'MANUAL';
    if (userId) data.created_by = userId;
    const saved = await this.prisma.expense.create({ data });
    await this.pettyCashService.createTopupFromExpense(saved.id);
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
    const { id: _id, created_at, updated_at, created_by, creator, ...rest } = dto;
    const data = this.normalizeDto(rest);
    await this.assertVehicleIsNotScrappedByExpenseData(data);
    await this.ensureSupplierPartner(data);
    if (Object.prototype.hasOwnProperty.call(data, 'other_charges')) {
      await this.applyOtherChargesTotal(data, id, existing);
    }
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
    await this.prisma.expense.update({ where: { id }, data: { deleted_at: new Date(), deleted_by: userId ?? null } });
    return { message: '刪除成功' };
  }

  // ── Bulk create expenses (for payroll auto-generation) ──────────
  async bulkCreate(expenses: any[]): Promise<number[]> {
    const createdIds: number[] = [];
    for (const dto of expenses) {
      const data = this.normalizeDto(dto);
      await this.assertVehicleIsNotScrappedByExpenseData(data);
      await this.ensureSupplierPartner(data);
      if (Object.prototype.hasOwnProperty.call(data, 'other_charges')) {
        await this.applyOtherChargesTotal(data);
      }
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

  async createItem(expenseId: number, dto: { description: string; quantity?: number; unit?: string; unit_price?: number; amount?: number }) {
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
        unit: dto.unit?.trim() || null,
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
        unit: dto.unit !== undefined ? (dto.unit?.trim() || null) : item.unit,
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
    const [agg, expense] = await Promise.all([
      this.prisma.expenseItem.aggregate({
        where: { expense_id: expenseId },
        _sum: { amount: true },
      }),
      this.prisma.expense.findUnique({
        where: { id: expenseId },
        select: { other_charges: true },
      }),
    ]);
    const subtotal = Number(agg._sum.amount) || 0;
    const otherCharges = this.normalizeOtherCharges(expense?.other_charges);
    const total = this.roundMoney(subtotal + this.otherChargesTotal(otherCharges));
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
