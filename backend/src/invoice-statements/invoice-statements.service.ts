import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateInvoiceStatementDto,
  CreateStatementItemDto,
  InvoiceStatementOtherChargeDto,
  MatchInvoiceStatementInvoicesDto,
  ReorderStatementItemsDto,
  UpdateInvoiceStatementDto,
  UpdateStatementItemDto,
} from './dto/create-invoice-statement.dto';

type InvoiceStatementListQuery = {
  page?: number;
  limit?: number;
  status?: string;
  client_id?: number | string;
  company_id?: number | string;
  period_from?: string;
  period_to?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: string;
  [key: string]: unknown;
};

type ColumnFilters = Record<string, string[]>;

const STATEMENT_STATUS_LABEL_TO_VALUE: Record<string, string> = {
  草稿: 'draft',
  已發出: 'issued',
};

const STATEMENT_STATUS_VALUE_TO_LABEL: Record<string, string> =
  Object.fromEntries(
    Object.entries(STATEMENT_STATUS_LABEL_TO_VALUE).map(([label, value]) => [
      value,
      label,
    ]),
  );

@Injectable()
export class InvoiceStatementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  private includeRelations = {
    company: {
      select: {
        id: true,
        name: true,
        name_en: true,
        internal_prefix: true,
        phone: true,
        address: true,
        invoice_address: true,
        invoice_phone: true,
        invoice_fax: true,
        invoice_company_name_en: true,
        invoice_color_theme: true,
        invoice_bank_info: true,
        invoice_default_payment_terms: true,
        company_logo_url: true,
        company_stamp_url: true,
        bank_accounts: {
          where: { is_active: true },
          orderBy: { id: 'asc' as const },
        },
      },
    },
    client: {
      select: {
        id: true,
        code: true,
        english_code: true,
        name: true,
        name_en: true,
        contact_person: true,
        phone: true,
        mobile: true,
        email: true,
        fax: true,
        address: true,
      },
    },
    creator: { select: { id: true, username: true, displayName: true } },
    items: {
      orderBy: { sort_order: 'asc' as const },
      include: {
        invoice: {
          select: {
            id: true,
            invoice_no: true,
            date: true,
            due_date: true,
            invoice_title: true,
            status: true,
            total_amount: true,
            paid_amount: true,
            outstanding: true,
            client_id: true,
            company_id: true,
          },
        },
      },
    },
  };

  // Build snapshot fields from a source invoice record
  private buildItemSnapshot(invoice: any) {
    return {
      item_type: 'invoice',
      item_invoice_no: invoice?.invoice_no ?? null,
      item_date: invoice?.date ?? null,
      item_title: invoice?.invoice_title ?? null,
      item_status: invoice?.status ?? null,
      item_amount: invoice?.total_amount ?? null,
      item_paid_amount: invoice?.paid_amount ?? null,
      item_outstanding: invoice?.outstanding ?? null,
      item_remarks: null as string | null,
    };
  }

  private parseDate(value: string | undefined, fieldName: string): Date {
    if (!value) throw new BadRequestException(`${fieldName} 必須填寫`);
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${fieldName} 格式不正確`);
    }
    return date;
  }

  private dateOnly(value: Date): Date {
    return new Date(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
    );
  }

  private normalizeIds(value: unknown): number[] {
    if (!Array.isArray(value)) return [];
    return [
      ...new Set(
        value
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id) && id > 0),
      ),
    ];
  }

  private normalizeOtherCharges(
    value: unknown,
  ): InvoiceStatementOtherChargeDto[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((charge) => ({
        name: String((charge as any)?.name || '').trim(),
        amount: Number((charge as any)?.amount || 0),
      }))
      .filter((charge) => charge.name || charge.amount !== 0);
  }

  private toNullableJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
    if (value === undefined || value === null) return Prisma.JsonNull;
    return value as Prisma.InputJsonValue;
  }

  private amount(value: unknown): number {
    return Number(value || 0);
  }

  private calcTotals(
    invoices: { total_amount: unknown }[],
    otherCharges: InvoiceStatementOtherChargeDto[] = [],
  ) {
    const subtotal = invoices.reduce(
      (sum, invoice) => sum + this.amount(invoice.total_amount),
      0,
    );
    const otherTotal = otherCharges.reduce(
      (sum, charge) => sum + this.amount(charge.amount),
      0,
    );
    const totalAmount = subtotal + otherTotal;

    return {
      statement_subtotal: Math.round(subtotal * 100) / 100,
      statement_total_amount: Math.round(totalAmount * 100) / 100,
      statement_invoice_count: invoices.length,
    };
  }

  private async generateStatementNo(
    companyId: number,
    clientId: number,
    date: Date,
  ): Promise<string> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { internal_prefix: true },
    });
    const client = await this.prisma.partner.findUnique({
      where: { id: clientId },
      select: { english_code: true, code: true },
    });

    const companyPrefix = company?.internal_prefix || 'ST';
    const clientCode = client?.english_code || client?.code || '';
    const prefix = `${companyPrefix}ST${clientCode}`;
    const yy = String(date.getUTCFullYear()).slice(-2);
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const yearMonth = `${yy}${mm}`;

    return this.prisma.$transaction(async (tx) => {
      let seq = await tx.invoiceStatementSequence.findFirst({
        where: { prefix, year_month: yearMonth },
      });

      if (!seq) {
        seq = await tx.invoiceStatementSequence.create({
          data: { prefix, year_month: yearMonth, last_seq: 0 },
        });
      }

      const updated = await tx.invoiceStatementSequence.update({
        where: { id: seq.id },
        data: { last_seq: seq.last_seq + 1 },
      });

      return `${prefix}${yearMonth}${String(updated.last_seq).padStart(3, '0')}`;
    });
  }

  private parseColumnFilters(query: InvoiceStatementListQuery): ColumnFilters {
    const raw = query.filters;
    if (!raw) return {};
    let parsed: unknown = raw;
    if (typeof raw === 'string') {
      try {
        parsed = JSON.parse(raw);
      } catch {
        return {};
      }
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    const filters: ColumnFilters = {};
    for (const [field, rawValues] of Object.entries(parsed)) {
      const values = Array.isArray(rawValues)
        ? rawValues.map((value) => String(value))
        : [];
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

  private formatAmount(value: unknown): string {
    return `$${Number(value || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  private addFieldConditions(
    target: Prisma.InvoiceStatementWhereInput[],
    fieldConditions: Prisma.InvoiceStatementWhereInput[],
  ) {
    if (fieldConditions.length === 1) target.push(fieldConditions[0]);
    if (fieldConditions.length > 1) target.push({ OR: fieldConditions });
  }

  private buildColumnFilterWhere(
    filters: ColumnFilters,
  ): Prisma.InvoiceStatementWhereInput {
    const conditions: Prisma.InvoiceStatementWhereInput[] = [];
    const stringFields = ['statement_no', 'statement_title'];
    const dateFields = ['statement_period_start', 'statement_period_end', 'created_at'];
    const amountFields = ['statement_subtotal', 'statement_total_amount'];

    for (const [field, values] of Object.entries(filters)) {
      if (values.includes('__NO_MATCH__')) {
        conditions.push({ id: -1 });
        continue;
      }

      const hasBlank = values.includes('-');
      const nonBlankValues = values.filter((value) => value !== '-');

      if (stringFields.includes(field)) {
        const fieldConditions: Prisma.InvoiceStatementWhereInput[] = [];
        if (nonBlankValues.length > 0) {
          fieldConditions.push({
            [field]: { in: nonBlankValues },
          } as Prisma.InvoiceStatementWhereInput);
        }
        if (hasBlank) {
          fieldConditions.push({
            OR: [{ [field]: null }, { [field]: '' }],
          } as Prisma.InvoiceStatementWhereInput);
        }
        this.addFieldConditions(conditions, fieldConditions);
      } else if (dateFields.includes(field)) {
        const dateRanges = nonBlankValues
          .map((value) => this.parseDisplayDate(value))
          .filter(
            (range): range is { start: Date; end: Date } => range !== null,
          );
        const fieldConditions: Prisma.InvoiceStatementWhereInput[] = [];
        if (dateRanges.length > 0) {
          fieldConditions.push({
            OR: dateRanges.map(
              (range) =>
                ({
                  [field]: { gte: range.start, lt: range.end },
                }) as Prisma.InvoiceStatementWhereInput,
            ),
          });
        }
        if (hasBlank)
          fieldConditions.push({ [field]: null } as Prisma.InvoiceStatementWhereInput);
        this.addFieldConditions(conditions, fieldConditions);
      } else if (amountFields.includes(field)) {
        const amountValues = nonBlankValues
          .map((value) => Number(value.replace(/[$,]/g, '')))
          .filter((value) => Number.isFinite(value));
        if (amountValues.length > 0) {
          conditions.push({
            [field]: { in: amountValues },
          } as Prisma.InvoiceStatementWhereInput);
        }
      } else if (field === 'statement_status') {
        const rawValues = nonBlankValues.map(
          (value) => STATEMENT_STATUS_LABEL_TO_VALUE[value] || value,
        );
        if (rawValues.length > 0)
          conditions.push({ statement_status: { in: rawValues } });
      } else if (field === 'client') {
        const fieldConditions: Prisma.InvoiceStatementWhereInput[] = [];
        for (const value of nonBlankValues) {
          const [code, ...nameParts] = value.split(' - ');
          const name = nameParts.join(' - ').trim();
          if (name) {
            fieldConditions.push({
              client: { is: { code: code.trim(), name } },
            });
          } else {
            fieldConditions.push({
              client: { is: { OR: [{ name: value }, { code: value }] } },
            });
          }
        }
        this.addFieldConditions(conditions, fieldConditions);
      }
    }

    return conditions.length > 0 ? { AND: conditions } : {};
  }

  private buildBaseWhere(
    query: InvoiceStatementListQuery,
    excludeFilterColumn?: string,
  ): Prisma.InvoiceStatementWhereInput {
    const where: Prisma.InvoiceStatementWhereInput = { deleted_at: null };

    if (query.status) where.statement_status = String(query.status);
    if (query.client_id) where.client_id = Number(query.client_id);
    if (query.company_id) where.company_id = Number(query.company_id);
    if (query.period_from || query.period_to) {
      where.statement_period_start = {};
      if (query.period_from)
        where.statement_period_start.gte = new Date(String(query.period_from));
      if (query.period_to)
        where.statement_period_start.lte = new Date(String(query.period_to));
    }
    if (query.search) {
      where.OR = [
        {
          statement_no: {
            contains: String(query.search),
            mode: 'insensitive',
          },
        },
        {
          statement_title: {
            contains: String(query.search),
            mode: 'insensitive',
          },
        },
        {
          statement_remarks: {
            contains: String(query.search),
            mode: 'insensitive',
          },
        },
        {
          client: {
            is: { name: { contains: String(query.search), mode: 'insensitive' } },
          },
        },
      ];
    }

    const columnFilters = this.parseColumnFilters(query);
    if (excludeFilterColumn) delete columnFilters[excludeFilterColumn];
    const columnFilterWhere = this.buildColumnFilterWhere(columnFilters);
    if (
      Array.isArray(columnFilterWhere.AND) &&
      columnFilterWhere.AND.length > 0
    ) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : []),
        ...columnFilterWhere.AND,
      ];
    }

    return where;
  }

  private buildOrderBy(
    sortBy: string | undefined,
    sortOrder: Prisma.SortOrder,
  ): Prisma.InvoiceStatementOrderByWithRelationInput {
    const directSortFields = [
      'id',
      'statement_no',
      'statement_title',
      'statement_period_start',
      'statement_period_end',
      'statement_invoice_count',
      'statement_subtotal',
      'statement_total_amount',
      'statement_status',
      'created_at',
    ];
    if (sortBy === 'client') return { client: { name: sortOrder } };
    if (sortBy === 'company') return { company: { name: sortOrder } };
    if (directSortFields.includes(sortBy || '')) {
      return {
        [sortBy!]: sortOrder,
      } as Prisma.InvoiceStatementOrderByWithRelationInput;
    }
    return { created_at: 'desc' };
  }

  private async resolveStatementInvoices(dto: CreateInvoiceStatementDto) {
    const invoiceIds = this.normalizeIds(dto.invoice_ids);
    let invoices: any[] = [];

    if (invoiceIds.length > 0) {
      invoices = await this.prisma.invoice.findMany({
        where: {
          id: { in: invoiceIds },
          deleted_at: null,
          invoice_is_active: true,
          status: { not: 'void' },
        },
        orderBy: { date: 'asc' },
      });
      if (invoices.length !== invoiceIds.length) {
        throw new BadRequestException('部分已選發票不存在或不可加入清單');
      }
    } else {
      const companyId = Number(dto.company_id || 0);
      const clientId = Number(dto.client_id || 0);
      const periodStart = this.parseDate(dto.period_start, '開始日期');
      const periodEnd = this.parseDate(dto.period_end, '結束日期');
      if (!companyId || !clientId) {
        throw new BadRequestException('請選擇公司、客戶及至少一張發票');
      }
      invoices = await this.prisma.invoice.findMany({
        where: {
          company_id: companyId,
          client_id: clientId,
          deleted_at: null,
          invoice_is_active: true,
          status: { not: 'void' },
          date: { gte: periodStart, lte: periodEnd },
        },
        orderBy: { date: 'asc' },
      });
    }

    if (invoices.length === 0) {
      throw new BadRequestException('請至少選擇一張發票');
    }

    const companyIds = [...new Set(invoices.map((invoice) => invoice.company_id))];
    const clientIds = [...new Set(invoices.map((invoice) => invoice.client_id))];
    if (companyIds.length !== 1) {
      throw new BadRequestException('請選擇同一公司的發票建立發票清單');
    }
    if (clientIds.length !== 1 || !clientIds[0]) {
      throw new BadRequestException('請選擇同一客戶的發票建立發票清單');
    }

    const companyId = Number(dto.company_id || companyIds[0]);
    const clientId = Number(dto.client_id || clientIds[0]);
    if (companyId !== Number(companyIds[0]) || clientId !== Number(clientIds[0])) {
      throw new BadRequestException('所選公司或客戶與發票資料不一致');
    }

    const sortedByDate = [...invoices].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );
    const periodStart = dto.period_start
      ? this.parseDate(dto.period_start, '開始日期')
      : this.dateOnly(sortedByDate[0].date);
    const periodEnd = dto.period_end
      ? this.parseDate(dto.period_end, '結束日期')
      : this.dateOnly(sortedByDate[sortedByDate.length - 1].date);

    if (periodEnd.getTime() < periodStart.getTime()) {
      throw new BadRequestException('結束日期不可早於開始日期');
    }

    return { invoices, companyId, clientId, periodStart, periodEnd };
  }

  async findAll(query: InvoiceStatementListQuery) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 50;
    const skip = (page - 1) * limit;
    const sortOrder: Prisma.SortOrder =
      String(query.sortOrder || '').toUpperCase() === 'ASC' ? 'asc' : 'desc';
    const orderBy = this.buildOrderBy(query.sortBy, sortOrder);
    const where = this.buildBaseWhere(query);

    const [data, total] = await Promise.all([
      this.prisma.invoiceStatement.findMany({
        where,
        include: this.includeRelations,
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.invoiceStatement.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async getFilterOptions(
    column: string,
    query: InvoiceStatementListQuery,
  ): Promise<string[]> {
    const where = this.buildBaseWhere(query, column);
    const stringColumns = ['statement_no', 'statement_title'];
    const dateColumns = ['statement_period_start', 'statement_period_end', 'created_at'];
    const amountColumns = ['statement_subtotal', 'statement_total_amount'];

    if (stringColumns.includes(column)) {
      const records = await this.prisma.invoiceStatement.findMany({
        where,
        select: { [column]: true } as any,
        distinct: [column as any],
        orderBy: { [column]: 'asc' } as any,
      });
      const values = records.map((record: any) => record[column] || '-');
      return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    }

    if (dateColumns.includes(column)) {
      const records = await this.prisma.invoiceStatement.findMany({
        where,
        select: { [column]: true } as any,
        orderBy: { [column]: 'desc' } as any,
      });
      const values = records.map((record: any) =>
        this.formatDisplayDate(record[column]),
      );
      return [...new Set(values)];
    }

    if (amountColumns.includes(column)) {
      const records = await this.prisma.invoiceStatement.findMany({
        where,
        select: { [column]: true } as any,
        distinct: [column as any],
        orderBy: { [column]: 'asc' } as any,
      });
      const values = records.map((record: any) =>
        this.formatAmount(record[column]),
      );
      return [...new Set(values)];
    }

    if (column === 'statement_status') {
      const records = await this.prisma.invoiceStatement.findMany({
        where,
        select: { statement_status: true },
        distinct: ['statement_status'],
        orderBy: { statement_status: 'asc' },
      });
      const values = records.map(
        (record) =>
          STATEMENT_STATUS_VALUE_TO_LABEL[record.statement_status] ||
          record.statement_status ||
          '-',
      );
      return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    }

    if (column === 'client') {
      const records = await this.prisma.invoiceStatement.findMany({
        where,
        select: { client: { select: { code: true, name: true } } },
        orderBy: { client: { name: 'asc' } },
      });
      const values = records.map((record) => {
        const client = record.client;
        return client?.code ? `${client.code} - ${client.name}` : client?.name || '-';
      });
      return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    }

    return [];
  }

  async findOne(id: number) {
    const statement = await this.prisma.invoiceStatement.findUnique({
      where: { id },
      include: this.includeRelations,
    });
    if (!statement || statement.deleted_at) {
      throw new NotFoundException('發票清單不存在');
    }
    return statement;
  }

  async findMatchingInvoices(dto: MatchInvoiceStatementInvoicesDto) {
    const periodStart = this.parseDate(dto.period_start, '開始日期');
    const periodEnd = this.parseDate(dto.period_end, '結束日期');
    if (periodEnd.getTime() < periodStart.getTime()) {
      throw new BadRequestException('結束日期不可早於開始日期');
    }

    return this.prisma.invoice.findMany({
      where: {
        company_id: Number(dto.company_id),
        client_id: Number(dto.client_id),
        deleted_at: null,
        invoice_is_active: true,
        status: { not: 'void' },
        date: { gte: periodStart, lte: periodEnd },
      },
      select: {
        id: true,
        invoice_no: true,
        date: true,
        invoice_title: true,
        status: true,
        total_amount: true,
        paid_amount: true,
        outstanding: true,
      },
      orderBy: [{ date: 'asc' }, { invoice_no: 'asc' }],
    });
  }

  async create(
    dto: CreateInvoiceStatementDto,
    userId?: number,
    ipAddress?: string,
  ) {
    const { invoices, companyId, clientId, periodStart, periodEnd } =
      await this.resolveStatementInvoices(dto);
    const otherCharges = this.normalizeOtherCharges(dto.other_charges);
    const totals = this.calcTotals(invoices, otherCharges);
    const statementNo = await this.generateStatementNo(
      companyId,
      clientId,
      periodStart,
    );

    const statement = await this.prisma.invoiceStatement.create({
      data: {
        statement_no: statementNo,
        statement_title: dto.statement_title?.trim() || null,
        company_id: companyId,
        client_id: clientId,
        statement_period_start: periodStart,
        statement_period_end: periodEnd,
        statement_subtotal: totals.statement_subtotal,
        statement_other_charges: this.toNullableJson(otherCharges),
        statement_total_amount: totals.statement_total_amount,
        statement_invoice_count: totals.statement_invoice_count,
        statement_remarks: dto.remarks?.trim() || null,
        statement_status: 'draft',
        created_by: userId || null,
        items: {
          create: invoices.map((invoice, index) => ({
            invoice_id: invoice.id,
            sort_order: index + 1,
            ...this.buildItemSnapshot(invoice),
          })),
        },
      },
      include: this.includeRelations,
    });

    if (userId) {
      await this.auditLogsService.log({
        userId,
        action: 'create',
        targetTable: 'invoice_statements',
        targetId: statement.id,
        changesAfter: statement,
        remarks: '建立發票清單',
        ipAddress,
      });
    }

    return statement;
  }

  async update(id: number, dto: UpdateInvoiceStatementDto, userId?: number) {
    const existing = await this.findOne(id);
    const otherCharges =
      dto.other_charges === undefined
        ? this.normalizeOtherCharges(existing.statement_other_charges)
        : this.normalizeOtherCharges(dto.other_charges);

    let invoiceIds = this.normalizeIds(dto.invoice_ids);
    if (dto.invoice_ids === undefined) {
      invoiceIds = existing.items.map((item: any) => item.invoice_id);
    }

    const invoices = await this.prisma.invoice.findMany({
      where: {
        id: { in: invoiceIds },
        deleted_at: null,
        invoice_is_active: true,
        status: { not: 'void' },
      },
      orderBy: { date: 'asc' },
    });

    if (invoiceIds.length > 0 && invoices.length !== invoiceIds.length) {
      throw new BadRequestException('部分發票不存在或不可加入清單');
    }

    const totals = this.calcTotals(invoices, otherCharges);
    const data: Prisma.InvoiceStatementUpdateInput = {
      statement_title:
        dto.statement_title === undefined
          ? undefined
          : dto.statement_title?.trim() || null,
      statement_status: dto.statement_status || undefined,
      statement_other_charges: this.toNullableJson(otherCharges),
      statement_total_amount: totals.statement_total_amount,
      statement_subtotal: totals.statement_subtotal,
      statement_invoice_count: totals.statement_invoice_count,
      statement_remarks:
        dto.remarks === undefined ? undefined : dto.remarks?.trim() || null,
      statement_show_paid_columns:
        dto.statement_show_paid_columns === undefined
          ? undefined
          : Boolean(dto.statement_show_paid_columns),
      statement_show_bank_info:
        dto.statement_show_bank_info === undefined
          ? undefined
          : Boolean(dto.statement_show_bank_info),
      statement_show_signature:
        dto.statement_show_signature === undefined
          ? undefined
          : Boolean(dto.statement_show_signature),
    };

    if (dto.period_start) {
      data.statement_period_start = this.parseDate(dto.period_start, '開始日期');
    }
    if (dto.period_end) {
      data.statement_period_end = this.parseDate(dto.period_end, '結束日期');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.invoice_ids !== undefined) {
        await tx.invoiceStatementItem.deleteMany({ where: { statement_id: id } });
      }
      const result = await tx.invoiceStatement.update({
        where: { id },
        data: {
          ...data,
          ...(dto.invoice_ids !== undefined
            ? {
                items: {
                  create: invoices.map((invoice, index) => ({
                    invoice_id: invoice.id,
                    sort_order: index + 1,
                    ...this.buildItemSnapshot(invoice),
                  })),
                },
              }
            : {}),
        },
        include: this.includeRelations,
      });
      return result;
    });

    if (userId) {
      await this.auditLogsService.log({
        userId,
        action: 'update',
        targetTable: 'invoice_statements',
        targetId: id,
        changesBefore: existing,
        changesAfter: updated,
        remarks: '更新發票清單',
      });
    }

    return updated;
  }

  async updateStatus(id: number, status: string) {
    if (!['draft', 'issued'].includes(status)) {
      throw new BadRequestException('無效狀態');
    }
    await this.findOne(id);
    return this.prisma.invoiceStatement.update({
      where: { id },
      data: { statement_status: status },
      include: this.includeRelations,
    });
  }

  async delete(id: number, userId?: number, ipAddress?: string) {
    const existing = await this.findOne(id);
    const deleted = await this.prisma.invoiceStatement.update({
      where: { id },
      data: { deleted_at: new Date() },
      include: this.includeRelations,
    });

    if (userId) {
      await this.auditLogsService.log({
        userId,
        action: 'delete',
        targetTable: 'invoice_statements',
        targetId: id,
        changesBefore: existing,
        changesAfter: deleted,
        remarks: '刪除發票清單',
        ipAddress,
      });
    }

    return { success: true };
  }

  // ─────────────────────────────────────────────────────────────
  // Statement item operations (snapshot-based)
  // ─────────────────────────────────────────────────────────────

  // Recalculate statement totals based on item snapshots (item_amount)
  private async recalcStatementTotals(tx: Prisma.TransactionClient, statementId: number) {
    const items = await tx.invoiceStatementItem.findMany({
      where: { statement_id: statementId },
    });
    const statement = await tx.invoiceStatement.findUnique({
      where: { id: statementId },
      select: { statement_other_charges: true },
    });
    const otherCharges = Array.isArray(statement?.statement_other_charges)
      ? (statement!.statement_other_charges as any[])
      : [];

    const subtotal = items.reduce(
      (sum, item) => sum + this.amount(item.item_amount),
      0,
    );
    const otherTotal = otherCharges.reduce(
      (sum, charge) => sum + this.amount((charge as any)?.amount),
      0,
    );
    const invoiceCount = items.filter(
      (item) => item.item_type !== 'custom',
    ).length;

    await tx.invoiceStatement.update({
      where: { id: statementId },
      data: {
        statement_subtotal: Math.round(subtotal * 100) / 100,
        statement_total_amount: Math.round((subtotal + otherTotal) * 100) / 100,
        statement_invoice_count: invoiceCount,
      },
    });
  }

  async reorderItems(
    statementId: number,
    dto: ReorderStatementItemsDto,
    userId?: number,
  ) {
    await this.findOne(statementId);
    const orders = Array.isArray(dto.items) ? dto.items : [];
    if (orders.length === 0) {
      return this.findOne(statementId);
    }

    const itemIds = orders.map((o) => Number(o.id));
    const existingItems = await this.prisma.invoiceStatementItem.findMany({
      where: { id: { in: itemIds }, statement_id: statementId },
      select: { id: true },
    });
    const validIds = new Set(existingItems.map((item) => item.id));

    await this.prisma.$transaction(
      orders
        .filter((o) => validIds.has(Number(o.id)))
        .map((o) =>
          this.prisma.invoiceStatementItem.update({
            where: { id: Number(o.id) },
            data: { sort_order: Number(o.sort_order) },
          }),
        ),
    );

    if (userId) {
      await this.auditLogsService.log({
        userId,
        action: 'update',
        targetTable: 'invoice_statement_items',
        targetId: statementId,
        remarks: '調整發票清單項目排序',
      });
    }

    return this.findOne(statementId);
  }

  async addItem(
    statementId: number,
    dto: CreateStatementItemDto,
    userId?: number,
  ) {
    await this.findOne(statementId);

    const maxItem = await this.prisma.invoiceStatementItem.findFirst({
      where: { statement_id: statementId },
      orderBy: { sort_order: 'desc' },
      select: { sort_order: true },
    });
    const nextSort =
      dto.sort_order !== undefined && dto.sort_order !== null
        ? Number(dto.sort_order)
        : (maxItem?.sort_order || 0) + 1;

    const itemType = dto.item_type === 'custom' ? 'custom' : 'invoice';
    let createData: Prisma.InvoiceStatementItemUncheckedCreateInput;

    if (itemType === 'invoice' && dto.invoice_id) {
      const invoice = await this.prisma.invoice.findFirst({
        where: {
          id: Number(dto.invoice_id),
          deleted_at: null,
          invoice_is_active: true,
          status: { not: 'void' },
        },
      });
      if (!invoice) {
        throw new BadRequestException('發票不存在或不可加入清單');
      }
      createData = {
        statement_id: statementId,
        invoice_id: invoice.id,
        sort_order: nextSort,
        ...this.buildItemSnapshot(invoice),
      };
    } else {
      // custom item (or invoice item without source)
      createData = {
        statement_id: statementId,
        invoice_id: null,
        sort_order: nextSort,
        item_type: 'custom',
        item_invoice_no: dto.item_invoice_no ?? null,
        item_date: dto.item_date ? new Date(dto.item_date) : null,
        item_title: dto.item_title ?? null,
        item_status: dto.item_status ?? null,
        item_amount:
          dto.item_amount === undefined ? null : Number(dto.item_amount),
        item_paid_amount:
          dto.item_paid_amount === undefined
            ? null
            : Number(dto.item_paid_amount),
        item_outstanding:
          dto.item_outstanding === undefined
            ? null
            : Number(dto.item_outstanding),
        item_remarks: dto.item_remarks ?? null,
      };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.invoiceStatementItem.create({ data: createData });
      await this.recalcStatementTotals(tx, statementId);
    });

    if (userId) {
      await this.auditLogsService.log({
        userId,
        action: 'create',
        targetTable: 'invoice_statement_items',
        targetId: statementId,
        remarks: '新增發票清單項目',
      });
    }

    return this.findOne(statementId);
  }

  async updateItem(
    statementId: number,
    itemId: number,
    dto: UpdateStatementItemDto,
    userId?: number,
  ) {
    await this.findOne(statementId);
    const item = await this.prisma.invoiceStatementItem.findFirst({
      where: { id: itemId, statement_id: statementId },
    });
    if (!item) {
      throw new NotFoundException('清單項目不存在');
    }

    const data: Prisma.InvoiceStatementItemUncheckedUpdateInput = {
      item_invoice_no:
        dto.item_invoice_no === undefined ? undefined : dto.item_invoice_no || null,
      item_date:
        dto.item_date === undefined
          ? undefined
          : dto.item_date
            ? new Date(dto.item_date)
            : null,
      item_title:
        dto.item_title === undefined ? undefined : dto.item_title || null,
      item_status:
        dto.item_status === undefined ? undefined : dto.item_status || null,
      item_amount:
        dto.item_amount === undefined ? undefined : Number(dto.item_amount),
      item_paid_amount:
        dto.item_paid_amount === undefined
          ? undefined
          : Number(dto.item_paid_amount),
      item_outstanding:
        dto.item_outstanding === undefined
          ? undefined
          : Number(dto.item_outstanding),
      item_remarks:
        dto.item_remarks === undefined ? undefined : dto.item_remarks || null,
      item_type: dto.item_type === undefined ? undefined : dto.item_type,
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.invoiceStatementItem.update({ where: { id: itemId }, data });
      await this.recalcStatementTotals(tx, statementId);
    });

    if (userId) {
      await this.auditLogsService.log({
        userId,
        action: 'update',
        targetTable: 'invoice_statement_items',
        targetId: itemId,
        remarks: '更新發票清單項目',
      });
    }

    return this.findOne(statementId);
  }

  async deleteItem(statementId: number, itemId: number, userId?: number) {
    await this.findOne(statementId);
    const item = await this.prisma.invoiceStatementItem.findFirst({
      where: { id: itemId, statement_id: statementId },
    });
    if (!item) {
      throw new NotFoundException('清單項目不存在');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.invoiceStatementItem.delete({ where: { id: itemId } });
      await this.recalcStatementTotals(tx, statementId);
    });

    if (userId) {
      await this.auditLogsService.log({
        userId,
        action: 'delete',
        targetTable: 'invoice_statement_items',
        targetId: itemId,
        remarks: '刪除發票清單項目',
      });
    }

    return this.findOne(statementId);
  }
}
