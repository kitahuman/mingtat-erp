import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentInService } from '../payment-in/payment-in.service';
import {
  InvoiceWorkLogDraftData,
  SaveInvoicePrepareDto,
  MatchInvoiceRatesDto,
  UpdateInvoiceItemsDto,
  InvoicePricingGroupDto,
  SaveInvoicePricingDraftDto,
  CreateInvoiceRevisionDto,
  UpdateInvoiceDto,
  InvoiceItemInputDto,
  InvoiceOtherChargeDto,
} from './dto/create-invoice.dto';

type InvoiceRateContext = {
  company_id: number | null;
  client_id: number | null;
  date: Date;
  client_contract_no?: string | null;
  quotation_id?: number | null;
};

type RateCardLike = {
  id: number;
  name?: string | null;
  description?: string | null;
  day_night?: unknown;
  night_rate?: unknown;
  rate?: unknown;
  night_unit?: string | null;
  unit?: string | null;
  day_unit?: string | null;
  mid_shift_rate?: unknown;
  mid_shift_unit?: string | null;
  day_rate?: unknown;
  client_contract_no?: unknown;
  service_type?: unknown;
  source_quotation_id?: unknown;
  tonnage?: unknown;
  machine_type?: unknown;
  origin?: unknown;
  destination?: unknown;
};

type InvoiceListQuery = {
  page?: number;
  limit?: number;
  status?: string;
  status_ne?: string;
  client_id?: number | string;
  project_id?: number | string;
  date_from?: string;
  date_to?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: string;
  [key: string]: unknown;
};

type ColumnFilters = Record<string, string[]>;

const INVOICE_STATUS_LABEL_TO_VALUE: Record<string, string> = {
  草稿: 'draft',
  已開立: 'issued',
  部分收款: 'partially_paid',
  已收清: 'paid',
  已作廢: 'void',
};

const INVOICE_STATUS_VALUE_TO_LABEL: Record<string, string> =
  Object.fromEntries(
    Object.entries(INVOICE_STATUS_LABEL_TO_VALUE).map(([label, value]) => [
      value,
      label,
    ]),
  );

type MatchRateResult = InvoicePricingGroupDto & {
  matched: boolean;
  item_name: string;
  quantity: number;
  unit_price: number | null;
  unit: string | null;
  rate_card_id: number | null;
  rate_card_name: string | null;
};

@Injectable()
export class InvoicesService {
  constructor(
    private prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly paymentInService: PaymentInService,
  ) {}

  // ── helpers ──────────────────────────────────────────────────
  private includeRelations = {
    client: {
      select: {
        id: true,
        name: true,
        code: true,
        address: true,
        contact_person: true,
        phone: true,
        fax: true,
        email: true,
      },
    },
    project: { select: { id: true, project_no: true, project_name: true } },
    quotation: { select: { id: true, quotation_no: true, project_name: true } },
    company: {
      select: {
        id: true,
        name: true,
        name_en: true,
        phone: true,
        address: true,
        internal_prefix: true,
        company_logo_url: true,
        invoice_color_theme: true,
        invoice_bank_info: true,
        invoice_default_payment_terms: true,
      },
    },
    items: { orderBy: { sort_order: 'asc' as const } },
  };

  private workLogIncludeRelations = {
    publisher: true,
    company_profile: true,
    company: true,
    client: true,
    quotation: true,
    contract: true,
    employee: true,
    project: true,
    fleet_driver: { include: { subcontractor: true } },
    verification_confirmations: {
      select: { source_code: true, status: true },
    },
  } as const;

  /**
   * Generate invoice number: {company_prefix}S{client_english_code}{YYMM}{SEQ:03d}
   * e.g. DTCSWH2601001 where company_prefix=DTCS, client_english_code=WH, YYMM=2601.
   */
  private async generateInvoiceNo(
    companyId: number,
    clientId: number | null,
    date: Date,
  ): Promise<string> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });
    const companyPrefix = company?.internal_prefix || 'INV';

    let clientCode = '';
    if (clientId) {
      const client = await this.prisma.partner.findUnique({
        where: { id: clientId },
      });
      clientCode = client?.english_code || '';
    }

    const prefix = `${companyPrefix}S${clientCode}`;
    const yy = String(date.getUTCFullYear()).slice(-2);
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const yearMonth = `${yy}${mm}`;

    return await this.prisma.$transaction(async (tx) => {
      let seq = await tx.invoiceSequence.findFirst({
        where: { prefix, year_month: yearMonth },
      });

      if (!seq) {
        seq = await tx.invoiceSequence.create({
          data: { prefix, year_month: yearMonth, last_seq: 0 },
        });
      }

      const updated = await tx.invoiceSequence.update({
        where: { id: seq.id },
        data: { last_seq: seq.last_seq + 1 },
      });

      return `${prefix}${yearMonth}${String(updated.last_seq).padStart(3, '0')}`;
    });
  }

  /**
   * Recalculate totals from items + retention + other_charges
   * total_amount = subtotal - retention_amount + sum(other_charges)
   */
  private calcTotals(
    items: {
      quantity: number | string | { toNumber?: () => number };
      unit_price: number | string | { toNumber?: () => number };
    }[],
    retentionRate: number,
    otherCharges: { name: string; amount: number }[] = [],
  ) {
    const subtotal = items.reduce((sum, item) => {
      return (
        sum + (Number(item.quantity) || 0) * (Number(item.unit_price) || 0)
      );
    }, 0);
    const retentionAmount = subtotal * (retentionRate / 100);
    const otherTotal = otherCharges.reduce(
      (sum, c) => sum + (Number(c.amount) || 0),
      0,
    );
    const totalAmount = subtotal - retentionAmount + otherTotal;
    return {
      subtotal: Math.round(subtotal * 100) / 100,
      retention_amount: Math.round(retentionAmount * 100) / 100,
      total_amount: Math.round(totalAmount * 100) / 100,
    };
  }

  private normalizeOtherCharges(value: unknown): InvoiceOtherChargeDto[] {
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
      .filter((charge): charge is InvoiceOtherChargeDto => charge !== null);
  }

  private toNullableJson(
    value: unknown,
  ): Prisma.InputJsonValue | typeof Prisma.JsonNull {
    if (value === null || value === undefined) return Prisma.JsonNull;
    return value as Prisma.InputJsonValue;
  }

  /**
   * Recalculate paid_amount and outstanding from PaymentIn records.
   * Delegates to the shared recalculatePaymentStatus in PaymentInService.
   */
  private async recalcPayments(invoiceId: number) {
    await this.paymentInService.recalculatePaymentStatus('INVOICE', invoiceId);
  }

  private getInvoiceFamilyRootId(invoice: {
    id: number;
    invoice_parent_id: number | null;
  }): number {
    return invoice.invoice_parent_id ?? invoice.id;
  }

  private async resolveInvoiceFamilyRootId(invoiceId: number): Promise<number> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, invoice_parent_id: true, deleted_at: true },
    });
    if (!invoice || invoice.deleted_at) {
      throw new NotFoundException('發票不存在');
    }
    return this.getInvoiceFamilyRootId(invoice);
  }

  private parseColumnFilters(query: InvoiceListQuery): ColumnFilters {
    const filters: ColumnFilters = {};
    for (const key of Object.keys(query)) {
      if (
        !key.startsWith('filter_') ||
        query[key] === undefined ||
        query[key] === ''
      )
        continue;
      const field = key.replace('filter_', '');
      const rawValue = String(query[key]);
      let values: string[];
      try {
        const parsed = JSON.parse(rawValue);
        values = Array.isArray(parsed)
          ? parsed.map((value) => String(value).trim()).filter(Boolean)
          : rawValue
              .split(',')
              .map((value) => value.trim())
              .filter(Boolean);
      } catch {
        values = rawValue
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean);
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

  private formatAmount(value: unknown): string {
    return `$${Number(value || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  private addFieldConditions(
    target: Prisma.InvoiceWhereInput[],
    fieldConditions: Prisma.InvoiceWhereInput[],
  ) {
    if (fieldConditions.length === 1) target.push(fieldConditions[0]);
    if (fieldConditions.length > 1) target.push({ OR: fieldConditions });
  }

  private buildColumnFilterWhere(
    filters: ColumnFilters,
  ): Prisma.InvoiceWhereInput {
    const conditions: Prisma.InvoiceWhereInput[] = [];
    const nullableStringFields = [
      'invoice_no',
      'invoice_title',
      'client_contract_no',
    ];
    const dateFields = ['date', 'due_date'];
    const amountFields = ['total_amount', 'paid_amount', 'outstanding'];

    for (const [field, values] of Object.entries(filters)) {
      if (values.includes('__NO_MATCH__')) {
        conditions.push({ id: -1 });
        continue;
      }

      const hasBlank = values.includes('-');
      const nonBlankValues = values.filter((value) => value !== '-');

      if (nullableStringFields.includes(field)) {
        const fieldConditions: Prisma.InvoiceWhereInput[] = [];
        if (nonBlankValues.length > 0) {
          fieldConditions.push({
            [field]: { in: nonBlankValues },
          } as Prisma.InvoiceWhereInput);
        }
        if (hasBlank) {
          fieldConditions.push({
            OR: [{ [field]: null }, { [field]: '' }],
          } as Prisma.InvoiceWhereInput);
        }
        this.addFieldConditions(conditions, fieldConditions);
      } else if (dateFields.includes(field)) {
        const dateRanges = nonBlankValues
          .map((value) => this.parseDisplayDate(value))
          .filter(
            (range): range is { start: Date; end: Date } => range !== null,
          );
        const fieldConditions: Prisma.InvoiceWhereInput[] = [];
        if (dateRanges.length > 0) {
          fieldConditions.push({
            OR: dateRanges.map(
              (range) =>
                ({
                  [field]: { gte: range.start, lt: range.end },
                }) as Prisma.InvoiceWhereInput,
            ),
          });
        }
        if (hasBlank)
          fieldConditions.push({ [field]: null } as Prisma.InvoiceWhereInput);
        this.addFieldConditions(conditions, fieldConditions);
      } else if (amountFields.includes(field)) {
        const amountValues = nonBlankValues
          .map((value) => Number(value.replace(/[$,]/g, '')))
          .filter((value) => Number.isFinite(value));
        if (amountValues.length > 0) {
          conditions.push({
            [field]: { in: amountValues },
          } as Prisma.InvoiceWhereInput);
        }
      } else if (field === 'status') {
        const rawValues = nonBlankValues.map(
          (value) => INVOICE_STATUS_LABEL_TO_VALUE[value] || value,
        );
        if (rawValues.length > 0)
          conditions.push({ status: { in: rawValues } });
      } else if (field === 'client') {
        const fieldConditions: Prisma.InvoiceWhereInput[] = [];
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
        if (hasBlank) fieldConditions.push({ client_id: null });
        this.addFieldConditions(conditions, fieldConditions);
      } else if (field === 'quotation') {
        const fieldConditions: Prisma.InvoiceWhereInput[] = [];
        if (nonBlankValues.length > 0) {
          fieldConditions.push({
            quotation: { is: { quotation_no: { in: nonBlankValues } } },
          });
        }
        if (hasBlank) fieldConditions.push({ quotation_id: null });
        this.addFieldConditions(conditions, fieldConditions);
      }
    }

    return conditions.length > 0 ? { AND: conditions } : {};
  }

  private buildBaseWhere(
    query: InvoiceListQuery,
    excludeFilterColumn?: string,
  ): Prisma.InvoiceWhereInput {
    const where: Prisma.InvoiceWhereInput = {
      deleted_at: null,
      invoice_is_active: true,
    };
    if (query.status) where.status = String(query.status);
    if (query.status_ne) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : []),
        { status: { not: String(query.status_ne) } },
      ];
    }
    if (query.client_id) where.client_id = Number(query.client_id);
    if (query.project_id) where.project_id = Number(query.project_id);
    if (query.date_from || query.date_to) {
      where.date = {};
      if (query.date_from) where.date.gte = new Date(query.date_from);
      if (query.date_to) where.date.lte = new Date(query.date_to);
    }
    if (query.search) {
      where.OR = [
        { invoice_no: { contains: String(query.search), mode: 'insensitive' } },
        {
          invoice_title: {
            contains: String(query.search),
            mode: 'insensitive',
          },
        },
        {
          client: {
            is: {
              name: { contains: String(query.search), mode: 'insensitive' },
            },
          },
        },
        {
          client_contract_no: {
            contains: String(query.search),
            mode: 'insensitive',
          },
        },
        { remarks: { contains: String(query.search), mode: 'insensitive' } },
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
  ): Prisma.InvoiceOrderByWithRelationInput {
    const directSortFields = [
      'id',
      'invoice_no',
      'invoice_title',
      'date',
      'due_date',
      'client_contract_no',
      'total_amount',
      'paid_amount',
      'outstanding',
      'status',
      'created_at',
    ];
    if (sortBy === 'client') return { client: { name: sortOrder } };
    if (sortBy === 'quotation')
      return { quotation: { quotation_no: sortOrder } };
    if (directSortFields.includes(sortBy || '')) {
      return { [sortBy!]: sortOrder } as Prisma.InvoiceOrderByWithRelationInput;
    }
    return { date: 'desc' };
  }

  private buildRevisionInvoiceNo(
    rootInvoiceNo: string,
    revisionNumber: number,
  ): string {
    const baseInvoiceNo = rootInvoiceNo.replace(/R\d+$/i, '');
    return `${baseInvoiceNo}R${revisionNumber}`;
  }

  private parseRevisionDate(value: string | undefined, fallback: Date): Date {
    if (!value) return fallback;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('無效日期');
    }
    return date;
  }

  private parseRevisionNullableDate(
    value: string | undefined,
    fallback: Date | null,
  ): Date | null {
    if (value === undefined) return fallback;
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('無效到期日');
    }
    return date;
  }

  // ── CRUD ─────────────────────────────────────────────────────

  async findAll(query: InvoiceListQuery) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 50;
    const skip = (page - 1) * limit;
    const sortOrder: Prisma.SortOrder =
      String(query.sortOrder || '').toUpperCase() === 'ASC' ? 'asc' : 'desc';
    const orderBy = this.buildOrderBy(query.sortBy, sortOrder);
    const where = this.buildBaseWhere(query);

    const [data, total, aggregates] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        include: this.includeRelations,
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.invoice.count({ where }),
      this.prisma.invoice.aggregate({
        where,
        _sum: {
          total_amount: true,
          paid_amount: true,
          outstanding: true,
        },
      }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      sum_total_amount: Number(aggregates._sum.total_amount || 0),
      sum_paid_amount: Number(aggregates._sum.paid_amount || 0),
      sum_outstanding: Number(aggregates._sum.outstanding || 0),
    };
  }

  async getFilterOptions(
    column: string,
    query: InvoiceListQuery,
  ): Promise<string[]> {
    const where = this.buildBaseWhere(query, column);
    const stringColumns = ['invoice_no', 'invoice_title', 'client_contract_no'];
    const dateColumns = ['date', 'due_date'];
    const amountColumns = ['total_amount', 'paid_amount', 'outstanding'];

    if (stringColumns.includes(column)) {
      const records = await this.prisma.invoice.findMany({
        where,
        select: { [column]: true } as any,
        distinct: [column as any],
        orderBy: { [column]: 'asc' } as any,
      });
      const values = records.map((record: any) => record[column] || '-');
      return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    }

    if (dateColumns.includes(column)) {
      const records = await this.prisma.invoice.findMany({
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
      const records = await this.prisma.invoice.findMany({
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

    if (column === 'status') {
      const records = await this.prisma.invoice.findMany({
        where,
        select: { status: true },
        distinct: ['status'],
        orderBy: { status: 'asc' },
      });
      const values = records.map(
        (record) =>
          INVOICE_STATUS_VALUE_TO_LABEL[record.status] || record.status || '-',
      );
      return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    }

    if (column === 'client') {
      const records = await this.prisma.invoice.findMany({
        where,
        select: { client: { select: { code: true, name: true } } },
        orderBy: { client: { name: 'asc' } },
      });
      const values = records.map((record) => {
        const client = record.client;
        return client?.code
          ? `${client.code} - ${client.name}`
          : client?.name || '-';
      });
      return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    }

    if (column === 'quotation') {
      const records = await this.prisma.invoice.findMany({
        where,
        select: { quotation: { select: { quotation_no: true } } },
        orderBy: { quotation: { quotation_no: 'asc' } },
      });
      const values = records.map(
        (record) => record.quotation?.quotation_no || '-',
      );
      return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    }

    return [];
  }

  async findOne(id: number) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: this.includeRelations,
    });
    if (!invoice || invoice.deleted_at)
      throw new NotFoundException('發票不存在');
    return invoice;
  }

  async createRevision(id: number, dto: CreateInvoiceRevisionDto = {}) {
    const source = await this.prisma.invoice.findUnique({
      where: { id },
      include: { items: { orderBy: { sort_order: 'asc' } } },
    });
    if (!source || source.deleted_at) {
      throw new NotFoundException('發票不存在');
    }

    const rootInvoiceId = this.getInvoiceFamilyRootId(source);

    return this.prisma.$transaction(async (tx) => {
      const latestRevision = await tx.invoice.findFirst({
        where: {
          OR: [{ id: rootInvoiceId }, { invoice_parent_id: rootInvoiceId }],
        },
        orderBy: [{ invoice_revision_number: 'desc' }, { id: 'desc' }],
        select: { invoice_revision_number: true },
      });
      const revisionNumber = (latestRevision?.invoice_revision_number ?? 0) + 1;

      const rootInvoice =
        source.id === rootInvoiceId
          ? { invoice_no: source.invoice_no }
          : await tx.invoice.findUnique({
              where: { id: rootInvoiceId },
              select: { invoice_no: true },
            });
      if (!rootInvoice) {
        throw new NotFoundException('原始發票不存在');
      }

      const invoiceNo =
        dto.invoice_no?.trim() ||
        this.buildRevisionInvoiceNo(rootInvoice.invoice_no, revisionNumber);

      return tx.invoice.create({
        data: {
          invoice_no: invoiceNo,
          invoice_title: source.invoice_title,
          client_contract_no: source.client_contract_no,
          date: this.parseRevisionDate(dto.date, source.date),
          due_date: this.parseRevisionNullableDate(
            dto.due_date,
            source.due_date,
          ),
          client_id: source.client_id,
          project_id: source.project_id,
          quotation_id: source.quotation_id,
          company_id: source.company_id,
          status: source.status,
          subtotal: source.subtotal,
          tax_rate: source.tax_rate,
          tax_amount: source.tax_amount,
          retention_rate: source.retention_rate,
          retention_amount: source.retention_amount,
          other_charges: this.toNullableJson(source.other_charges),
          total_amount: source.total_amount,
          paid_amount: source.paid_amount,
          outstanding: source.outstanding,
          payment_terms: source.payment_terms,
          invoice_custom_payment_terms: source.invoice_custom_payment_terms,
          invoice_language: source.invoice_language,
          invoice_show_bank: source.invoice_show_bank,
          invoice_show_client_address: source.invoice_show_client_address,
          invoice_show_client_phone: source.invoice_show_client_phone,
          remarks: source.remarks,
          invoice_parent_id: rootInvoiceId,
          invoice_revision_number: revisionNumber,
          invoice_is_active: false,
          items: {
            create: source.items.map((item) => ({
              item_name: item.item_name,
              description: item.description,
              quantity: item.quantity,
              unit: item.unit,
              unit_price: item.unit_price,
              amount: item.amount,
              sort_order: item.sort_order,
            })),
          },
        },
        include: this.includeRelations,
      });
    });
  }

  async setActive(id: number) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      select: { id: true, invoice_parent_id: true, deleted_at: true },
    });
    if (!invoice || invoice.deleted_at) {
      throw new NotFoundException('發票不存在');
    }

    const rootInvoiceId = this.getInvoiceFamilyRootId(invoice);
    return this.prisma.$transaction(async (tx) => {
      await tx.invoice.updateMany({
        where: {
          deleted_at: null,
          OR: [{ id: rootInvoiceId }, { invoice_parent_id: rootInvoiceId }],
        },
        data: { invoice_is_active: false },
      });

      return tx.invoice.update({
        where: { id },
        data: { invoice_is_active: true },
        include: this.includeRelations,
      });
    });
  }

  async getRevisions(id: number) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      select: { id: true, invoice_parent_id: true, deleted_at: true },
    });
    if (!invoice || invoice.deleted_at) {
      throw new NotFoundException('發票不存在');
    }

    const rootInvoiceId = this.getInvoiceFamilyRootId(invoice);
    return this.prisma.invoice.findMany({
      where: {
        deleted_at: null,
        OR: [{ id: rootInvoiceId }, { invoice_parent_id: rootInvoiceId }],
      },
      include: this.includeRelations,
      orderBy: [{ invoice_revision_number: 'asc' }, { id: 'asc' }],
    });
  }

  async create(
    dto: {
      date: string;
      due_date?: string;
      client_id?: number | string;
      project_id?: number | string;
      quotation_id?: number | string;
      company_id: number | string;
      invoice_title?: string;
      client_contract_no?: string;
      retention_rate?: number | string;
      other_charges?: { name: string; amount: number }[];
      payment_terms?: string;
      invoice_custom_payment_terms?: string;
      invoice_language?: string;
      invoice_show_bank?: boolean;
      invoice_show_client_address?: boolean;
      invoice_show_client_phone?: boolean;
      remarks?: string;
      items?: {
        item_name?: string;
        description?: string;
        quantity: number;
        unit?: string;
        unit_price: number;
        sort_order?: number;
      }[];
    },
    userId?: number,
    ipAddress?: string,
  ) {
    const companyId = Number(dto.company_id);
    if (!companyId) throw new BadRequestException('請選擇公司');

    const invoiceDate = new Date(dto.date);
    const clientId = dto.client_id ? Number(dto.client_id) : null;
    const invoiceNo = await this.generateInvoiceNo(
      companyId,
      clientId,
      invoiceDate,
    );
    const retentionRate = Number(dto.retention_rate) || 0;
    const otherCharges = this.normalizeOtherCharges(dto.other_charges);
    const items = dto.items || [];
    const { subtotal, retention_amount, total_amount } = this.calcTotals(
      items,
      retentionRate,
      otherCharges,
    );

    const invoice = await this.prisma.invoice.create({
      data: {
        invoice_no: invoiceNo,
        invoice_title: dto.invoice_title || null,
        client_contract_no: dto.client_contract_no || null,
        date: invoiceDate,
        due_date: dto.due_date ? new Date(dto.due_date) : null,
        client_id: clientId,
        project_id: dto.project_id ? Number(dto.project_id) : null,
        quotation_id: dto.quotation_id ? Number(dto.quotation_id) : null,
        company_id: companyId,
        retention_rate: retentionRate,
        retention_amount,
        other_charges:
          otherCharges.length > 0
            ? this.toNullableJson(otherCharges)
            : Prisma.JsonNull,
        subtotal,
        tax_rate: 0,
        tax_amount: 0,
        total_amount,
        outstanding: total_amount,
        payment_terms: dto.payment_terms || null,
        invoice_custom_payment_terms: dto.invoice_custom_payment_terms || null,
        invoice_language: dto.invoice_language || 'zh',
        invoice_show_bank: dto.invoice_show_bank ?? true,
        invoice_show_client_address: dto.invoice_show_client_address ?? true,
        invoice_show_client_phone: dto.invoice_show_client_phone ?? true,
        remarks: dto.remarks || null,
        invoice_revision_number: 0,
        invoice_is_active: true,
        items: {
          create: items.map((item, idx) => ({
            item_name: item.item_name || null,
            description: item.description || null,
            quantity: item.quantity || 0,
            unit: item.unit || null,
            unit_price: item.unit_price || 0,
            amount:
              Math.round(
                (Number(item.quantity) || 0) *
                  (Number(item.unit_price) || 0) *
                  100,
              ) / 100,
            sort_order: item.sort_order || idx + 1,
          })),
        },
      },
      include: this.includeRelations,
    });

    if (userId) {
      try {
        await this.auditLogsService.log({
          userId,
          action: 'create',
          targetTable: 'invoices',
          targetId: invoice.id,
          changesAfter: invoice,
          ipAddress,
        });
      } catch (e) {
        console.error('Audit log error:', e);
      }
    }

    return invoice;
  }

  /**
   * Create invoice from quotation
   */
  async createFromQuotation(
    quotationId: number,
    dto?: {
      date?: string;
      due_date?: string;
      retention_rate?: number;
      payment_terms?: string;
      remarks?: string;
    },
    userId?: number,
  ) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id: quotationId },
      include: {
        items: { orderBy: { sort_order: 'asc' } },
        client: true,
        company: true,
      },
    });

    if (!quotation) throw new NotFoundException('報價單不存在');

    // Check if already converted
    const existing = await this.prisma.invoice.findFirst({
      where: { quotation_id: quotationId },
    });
    if (existing) {
      throw new BadRequestException(
        `此報價單已轉為發票 ${existing.invoice_no}`,
      );
    }

    const invoiceDate = dto?.date ? new Date(dto.date) : new Date();
    const invoiceNo = await this.generateInvoiceNo(
      quotation.company_id,
      quotation.client_id,
      invoiceDate,
    );
    const retentionRate = dto?.retention_rate || 0;

    const items = (quotation.items || []).map((item, idx) => ({
      item_name: item.item_name || null,
      description: item.item_description || null,
      quantity: Number(item.quantity) || 0,
      unit: item.unit || null,
      unit_price: Number(item.unit_price) || 0,
      amount:
        Math.round(
          (Number(item.quantity) || 0) * (Number(item.unit_price) || 0) * 100,
        ) / 100,
      sort_order: idx + 1,
    }));

    const { subtotal, retention_amount, total_amount } = this.calcTotals(
      items.map((i) => ({ quantity: i.quantity, unit_price: i.unit_price })),
      retentionRate,
      [],
    );

    const invoice = await this.prisma.invoice.create({
      data: {
        invoice_no: invoiceNo,
        date: invoiceDate,
        due_date: dto?.due_date ? new Date(dto.due_date) : null,
        client_id: quotation.client_id,
        project_id: quotation.project_id,
        quotation_id: quotationId,
        company_id: quotation.company_id,
        retention_rate: retentionRate,
        retention_amount,
        tax_rate: 0,
        tax_amount: 0,
        subtotal,
        total_amount,
        outstanding: total_amount,
        payment_terms: dto?.payment_terms || quotation.payment_terms || null,
        remarks: dto?.remarks || null,
        items: {
          create: items,
        },
      },
      include: this.includeRelations,
    });

    // Mark quotation as invoiced
    await this.prisma.quotation.update({
      where: { id: quotationId },
      data: { status: 'invoiced' },
    });

    if (userId) {
      try {
        await this.auditLogsService.log({
          userId,
          action: 'create',
          targetTable: 'invoices',
          targetId: invoice.id,
          changesAfter: invoice,
        });
      } catch (e) {
        console.error('Audit log error:', e);
      }
    }

    return invoice;
  }

  async update(
    id: number,
    dto: UpdateInvoiceDto,
    userId?: number,
    ipAddress?: string,
  ) {
    const existing = await this.prisma.invoice.findUnique({ where: { id } });
    if (!existing || existing.deleted_at)
      throw new NotFoundException('發票不存在');

    const data: Prisma.InvoiceUncheckedUpdateInput = {};
    if (dto.invoice_no !== undefined) {
      const invoiceNo = dto.invoice_no.trim();
      if (!invoiceNo) throw new BadRequestException('發票編號不能為空');
      data.invoice_no = invoiceNo;
    }
    if (dto.date !== undefined) data.date = new Date(dto.date);
    if (dto.company_id !== undefined) {
      const companyId = Number(dto.company_id);
      if (!companyId) throw new BadRequestException('請選擇公司');
      data.company_id = companyId;
    }
    if (dto.due_date !== undefined)
      data.due_date = dto.due_date ? new Date(dto.due_date) : null;
    if (dto.client_id !== undefined)
      data.client_id = dto.client_id ? Number(dto.client_id) : null;
    if (dto.project_id !== undefined)
      data.project_id = dto.project_id ? Number(dto.project_id) : null;
    if (dto.quotation_id !== undefined)
      data.quotation_id = dto.quotation_id ? Number(dto.quotation_id) : null;
    if (dto.invoice_title !== undefined)
      data.invoice_title = dto.invoice_title || null;
    if (dto.client_contract_no !== undefined)
      data.client_contract_no = dto.client_contract_no || null;
    if (dto.retention_rate !== undefined)
      data.retention_rate = Number(dto.retention_rate) || 0;
    if (dto.payment_terms !== undefined) data.payment_terms = dto.payment_terms;
    if (dto.invoice_custom_payment_terms !== undefined)
      data.invoice_custom_payment_terms =
        dto.invoice_custom_payment_terms || null;
    if (dto.invoice_language !== undefined)
      data.invoice_language = dto.invoice_language || 'zh';
    if (dto.invoice_show_bank !== undefined)
      data.invoice_show_bank = dto.invoice_show_bank;
    if (dto.invoice_show_client_address !== undefined)
      data.invoice_show_client_address = dto.invoice_show_client_address;
    if (dto.invoice_show_client_phone !== undefined)
      data.invoice_show_client_phone = dto.invoice_show_client_phone;
    if (dto.remarks !== undefined) data.remarks = dto.remarks;

    const companyChanged =
      dto.company_id !== undefined &&
      Number(dto.company_id) !== existing.company_id;
    const clientChanged =
      dto.client_id !== undefined &&
      (dto.client_id ? Number(dto.client_id) : null) !== existing.client_id;
    const dateChanged =
      dto.date !== undefined &&
      new Date(dto.date).toISOString() !== existing.date.toISOString();

    if (
      dto.invoice_no === undefined &&
      (companyChanged || clientChanged || dateChanged)
    ) {
      const newCompanyId =
        dto.company_id !== undefined
          ? Number(dto.company_id)
          : existing.company_id;
      const newClientId =
        dto.client_id !== undefined
          ? dto.client_id
            ? Number(dto.client_id)
            : null
          : existing.client_id;
      const newDate =
        dto.date !== undefined ? new Date(dto.date) : existing.date;
      data.invoice_no = await this.generateInvoiceNo(
        newCompanyId,
        newClientId,
        newDate,
      );
    }

    // Update items if provided
    if (dto.items) {
      await this.prisma.invoiceItem.deleteMany({ where: { invoice_id: id } });
      const retentionRate =
        dto.retention_rate !== undefined
          ? Number(dto.retention_rate)
          : Number(existing.retention_rate);
      const otherCharges = this.normalizeOtherCharges(dto.other_charges);
      const { subtotal, retention_amount, total_amount } = this.calcTotals(
        dto.items,
        retentionRate,
        otherCharges,
      );
      data.subtotal = subtotal;
      data.retention_amount = retention_amount;
      data.total_amount = total_amount;
      data.outstanding =
        Math.round((total_amount - Number(existing.paid_amount)) * 100) / 100;
      if (data.outstanding < 0) data.outstanding = 0;
      if (dto.other_charges !== undefined)
        data.other_charges =
          otherCharges.length > 0
            ? this.toNullableJson(otherCharges)
            : Prisma.JsonNull;

      await this.prisma.invoiceItem.createMany({
        data: dto.items.map((item: InvoiceItemInputDto, idx: number) => ({
          invoice_id: id,
          item_name: item.item_name || null,
          description: item.description || null,
          quantity: item.quantity || 0,
          unit: item.unit || null,
          unit_price: item.unit_price || 0,
          amount:
            Math.round(
              (Number(item.quantity) || 0) *
                (Number(item.unit_price) || 0) *
                100,
            ) / 100,
          sort_order: item.sort_order || idx + 1,
        })),
      });
    } else if (
      dto.other_charges !== undefined ||
      dto.retention_rate !== undefined
    ) {
      // Recalculate totals even if items not changed
      const currentItems = await this.prisma.invoiceItem.findMany({
        where: { invoice_id: id },
      });
      const retentionRate =
        dto.retention_rate !== undefined
          ? Number(dto.retention_rate)
          : Number(existing.retention_rate);
      const otherCharges =
        dto.other_charges !== undefined
          ? this.normalizeOtherCharges(dto.other_charges)
          : this.normalizeOtherCharges(existing.other_charges);
      const { subtotal, retention_amount, total_amount } = this.calcTotals(
        currentItems,
        retentionRate,
        otherCharges,
      );
      data.subtotal = subtotal;
      data.retention_amount = retention_amount;
      data.total_amount = total_amount;
      data.outstanding =
        Math.round((total_amount - Number(existing.paid_amount)) * 100) / 100;
      if (data.outstanding < 0) data.outstanding = 0;
      if (dto.other_charges !== undefined)
        data.other_charges =
          otherCharges.length > 0
            ? this.toNullableJson(otherCharges)
            : Prisma.JsonNull;
    }

    const invoice = await this.prisma.invoice.update({
      where: { id },
      data,
      include: this.includeRelations,
    });

    if (userId) {
      try {
        await this.auditLogsService.log({
          userId,
          action: 'update',
          targetTable: 'invoices',
          targetId: id,
          changesBefore: existing,
          changesAfter: invoice,
          ipAddress,
        });
      } catch (e) {
        console.error('Audit log error:', e);
      }
    }

    return invoice;
  }

  async linkWorkLogs(invoiceId: number, workLogIds: number[]) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });
    if (!invoice || invoice.deleted_at)
      throw new NotFoundException('發票不存在');

    const uniqueIds = [
      ...new Set((workLogIds || []).map(Number).filter(Boolean)),
    ];
    if (uniqueIds.length === 0) {
      throw new BadRequestException('請選擇至少一筆工作紀錄');
    }

    const existingWorkLogs = await this.prisma.workLog.findMany({
      where: { id: { in: uniqueIds }, deleted_at: null },
      select: { id: true },
    });
    const existingIds = existingWorkLogs.map((wl) => wl.id);
    if (existingIds.length === 0) {
      throw new NotFoundException('工作紀錄不存在');
    }

    const rootInvoiceId = this.getInvoiceFamilyRootId(invoice);

    await this.prisma.invoiceWorkLog.createMany({
      data: existingIds.map((workLogId) => ({
        invoice_id: rootInvoiceId,
        work_log_id: workLogId,
      })),
      skipDuplicates: true,
    });

    return { linked: existingIds.length };
  }

  async unlinkWorkLogs(invoiceId: number, workLogIds: number[]) {
    const uniqueIds = [
      ...new Set((workLogIds || []).map(Number).filter(Boolean)),
    ];
    if (uniqueIds.length === 0) {
      throw new BadRequestException('請選擇至少一筆工作紀錄');
    }

    const rootInvoiceId = await this.resolveInvoiceFamilyRootId(invoiceId);

    const result = await this.prisma.invoiceWorkLog.deleteMany({
      where: {
        invoice_id: rootInvoiceId,
        work_log_id: { in: uniqueIds },
      },
    });

    return { unlinked: result.count };
  }

  async getLinkedWorkLogs(invoiceId: number) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, invoice_parent_id: true, deleted_at: true },
    });
    if (!invoice || invoice.deleted_at)
      throw new NotFoundException('發票不存在');
    const rootInvoiceId = this.getInvoiceFamilyRootId(invoice);

    const links = await this.prisma.invoiceWorkLog.findMany({
      where: { invoice_id: rootInvoiceId },
      include: {
        work_log: {
          include: {
            employee: true,
            client: true,
            company: true,
            fleet_driver: { include: { subcontractor: true } },
          },
        },
      },
      orderBy: { work_log: { scheduled_date: 'desc' } },
    });

    return links.map((link) => link.work_log);
  }

  private isEmptyDraftData(draftData: InvoiceWorkLogDraftData): boolean {
    return Object.keys(draftData || {}).length === 0;
  }

  private toJsonInput(
    value: unknown,
    fallback: Prisma.InputJsonValue,
  ): Prisma.InputJsonValue {
    if (value === null || value === undefined) return fallback;
    return value as Prisma.InputJsonValue;
  }

  async getPrepare(invoiceId: number) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        invoice_no: true,
        invoice_parent_id: true,
        deleted_at: true,
      },
    });
    if (!invoice || invoice.deleted_at)
      throw new NotFoundException('發票不存在');
    const rootInvoiceId = this.getInvoiceFamilyRootId(invoice);

    const [links, drafts] = await Promise.all([
      this.prisma.invoiceWorkLog.findMany({
        where: { invoice_id: rootInvoiceId },
        include: {
          work_log: {
            include: this.workLogIncludeRelations,
          },
        },
        orderBy: { work_log: { scheduled_date: 'desc' } },
      }),
      this.prisma.invoiceWorkLogDraft.findMany({
        where: { invoice_id: rootInvoiceId },
        orderBy: { updated_at: 'desc' },
      }),
    ]);

    return {
      invoice: { id: invoice.id, invoice_no: invoice.invoice_no },
      work_logs: links.map((link) => link.work_log),
      drafts: drafts.map((draft) => ({
        id: draft.id,
        invoice_id: draft.invoice_id,
        work_log_id: draft.work_log_id,
        draft_data: draft.draft_data,
        updated_at: draft.updated_at,
      })),
    };
  }

  async savePrepare(invoiceId: number, dto: SaveInvoicePrepareDto) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, invoice_parent_id: true, deleted_at: true },
    });
    if (!invoice || invoice.deleted_at)
      throw new NotFoundException('發票不存在');
    const rootInvoiceId = this.getInvoiceFamilyRootId(invoice);

    const drafts = dto.drafts || [];
    const uniqueWorkLogIds = [
      ...new Set(
        drafts.map((draft) => Number(draft.work_log_id)).filter(Boolean),
      ),
    ];
    if (uniqueWorkLogIds.length === 0) {
      return { saved: 0, deleted: 0 };
    }

    const linkedWorkLogs = await this.prisma.invoiceWorkLog.findMany({
      where: {
        invoice_id: rootInvoiceId,
        work_log_id: { in: uniqueWorkLogIds },
      },
      select: { work_log_id: true },
    });
    const linkedIds = new Set(linkedWorkLogs.map((link) => link.work_log_id));
    const invalidIds = uniqueWorkLogIds.filter(
      (workLogId) => !linkedIds.has(workLogId),
    );
    if (invalidIds.length > 0) {
      throw new BadRequestException(
        `工作紀錄未連結至此發票: ${invalidIds.join(', ')}`,
      );
    }

    let saved = 0;
    let deleted = 0;
    await this.prisma.$transaction(async (tx) => {
      for (const draft of drafts) {
        const workLogId = Number(draft.work_log_id);
        if (!workLogId || !linkedIds.has(workLogId)) continue;

        if (this.isEmptyDraftData(draft.draft_data)) {
          const result = await tx.invoiceWorkLogDraft.deleteMany({
            where: { invoice_id: rootInvoiceId, work_log_id: workLogId },
          });
          deleted += result.count;
          continue;
        }

        await tx.invoiceWorkLogDraft.upsert({
          where: {
            invoice_id_work_log_id: {
              invoice_id: rootInvoiceId,
              work_log_id: workLogId,
            },
          },
          create: {
            invoice_id: rootInvoiceId,
            work_log_id: workLogId,
            draft_data: draft.draft_data as Prisma.InputJsonObject,
          },
          update: {
            draft_data: draft.draft_data as Prisma.InputJsonObject,
          },
        });
        saved += 1;
      }
    });

    return { saved, deleted };
  }

  async clearPrepare(invoiceId: number) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, invoice_parent_id: true, deleted_at: true },
    });
    if (!invoice || invoice.deleted_at)
      throw new NotFoundException('發票不存在');
    const rootInvoiceId = this.getInvoiceFamilyRootId(invoice);

    const result = await this.prisma.invoiceWorkLogDraft.deleteMany({
      where: { invoice_id: rootInvoiceId },
    });
    return { deleted: result.count };
  }

  private normalizePricingText(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    return text.length > 0 ? text : null;
  }

  private hasPricingValue(value: unknown): boolean {
    return this.normalizePricingText(value) !== null;
  }

  private rateCardTextMatches(
    rateCardValue: unknown,
    groupValue: unknown,
  ): boolean {
    const cardText = this.normalizePricingText(rateCardValue);
    const groupText = this.normalizePricingText(groupValue);
    if (!cardText || !groupText) return true;
    return cardText === groupText;
  }

  private rateCardNumberMatches(
    rateCardValue: unknown,
    groupValue: unknown,
  ): boolean {
    const cardNumber = Number(rateCardValue) || 0;
    const groupNumber = Number(groupValue) || 0;
    if (!cardNumber || !groupNumber) return true;
    return cardNumber === groupNumber;
  }

  private getPricingMatchDate(
    group: InvoicePricingGroupDto,
    invoiceDate: Date,
  ): Date {
    const raw = this.normalizePricingText(group.work_date) || invoiceDate;
    const date = raw instanceof Date ? raw : new Date(raw);
    return Number.isNaN(date.getTime()) ? invoiceDate : date;
  }

  private mergeDraftIntoWorkLog<T extends object>(
    workLog: T,
    draftData: unknown,
  ) {
    const draft =
      draftData && typeof draftData === 'object'
        ? (draftData as Record<string, unknown>)
        : {};
    return {
      ...workLog,
      ...draft,
      _draft_data: draft,
      _has_draft: Object.keys(draft).length > 0,
    };
  }

  private resolveInvoiceRate(
    card: RateCardLike,
    dayNight: unknown,
  ): { unit_price: number; unit: string } {
    const label =
      this.normalizePricingText(dayNight) ||
      this.normalizePricingText(card.day_night) ||
      '';
    if (label.includes('夜') || label.toLowerCase().includes('night')) {
      return {
        unit_price: Number(card.night_rate) || Number(card.rate) || 0,
        unit: card.night_unit || card.unit || card.day_unit || '',
      };
    }
    if (label.includes('中') || label.toLowerCase().includes('mid')) {
      return {
        unit_price: Number(card.mid_shift_rate) || Number(card.rate) || 0,
        unit: card.mid_shift_unit || card.unit || card.day_unit || '',
      };
    }
    return {
      unit_price: Number(card.day_rate) || Number(card.rate) || 0,
      unit: card.day_unit || card.unit || '',
    };
  }

  private buildRateMatchItemName(group: InvoicePricingGroupDto): string {
    const parts = [group.tonnage, group.machine_type, group.day_night]
      .map((value) => this.normalizePricingText(value))
      .filter(Boolean);
    const origin = this.normalizePricingText(group.origin);
    const destination = this.normalizePricingText(group.destination);
    if (origin || destination)
      parts.push(`${origin || '—'}→${destination || '—'}`);
    return parts.join(' ') || '發票項目';
  }

  private async matchSingleRateCard(
    group: InvoicePricingGroupDto,
    invoice: InvoiceRateContext,
  ): Promise<RateCardLike | null> {
    const companyId = Number(group.company_id || invoice.company_id) || null;
    const clientId = Number(group.client_id || invoice.client_id) || null;
    if (!companyId || !clientId) return null;

    const matchDate = this.getPricingMatchDate(group, invoice.date);
    const candidates = await this.prisma.rateCard.findMany({
      where: {
        status: 'active',
        rate_card_type: { in: ['rental', 'client'] },
        deleted_at: null,
        company_id: companyId,
        client_id: clientId,
        OR: [{ effective_date: null }, { effective_date: { lte: matchDate } }],
        AND: [
          {
            OR: [{ expiry_date: null }, { expiry_date: { gte: matchDate } }],
          },
        ],
      },
      orderBy: [{ effective_date: 'desc' }, { id: 'desc' }],
    });

    const scored = candidates
      .filter((card) =>
        this.rateCardTextMatches(
          card.client_contract_no,
          group.client_contract_no || invoice.client_contract_no,
        ),
      )
      .filter((card) =>
        this.rateCardTextMatches(card.service_type, group.service_type),
      )
      .filter((card) =>
        this.rateCardNumberMatches(
          card.source_quotation_id,
          group.quotation_id || invoice.quotation_id,
        ),
      )
      .filter((card) =>
        this.rateCardTextMatches(card.day_night, group.day_night),
      )
      .filter((card) => this.rateCardTextMatches(card.tonnage, group.tonnage))
      .filter((card) =>
        this.rateCardTextMatches(card.machine_type, group.machine_type),
      )
      .filter((card) => this.rateCardTextMatches(card.origin, group.origin))
      .filter((card) =>
        this.rateCardTextMatches(card.destination, group.destination),
      )
      .map((card) => {
        const specificity = [
          card.client_contract_no,
          card.service_type,
          card.source_quotation_id,
          card.day_night,
          card.tonnage,
          card.machine_type,
          card.origin,
          card.destination,
        ].filter((value) => this.hasPricingValue(value)).length;
        return { card, specificity };
      })
      .sort((a, b) => b.specificity - a.specificity || b.card.id - a.card.id);

    return scored[0]?.card || null;
  }

  async getPricingData(invoiceId: number) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: this.includeRelations,
    });
    if (!invoice || invoice.deleted_at)
      throw new NotFoundException('發票不存在');
    const rootInvoiceId = this.getInvoiceFamilyRootId(invoice);

    const [links, drafts] = await Promise.all([
      this.prisma.invoiceWorkLog.findMany({
        where: { invoice_id: rootInvoiceId },
        include: { work_log: { include: this.workLogIncludeRelations } },
        orderBy: { work_log: { scheduled_date: 'desc' } },
      }),
      this.prisma.invoiceWorkLogDraft.findMany({
        where: { invoice_id: rootInvoiceId },
        orderBy: { updated_at: 'desc' },
      }),
    ]);

    const draftByWorkLogId = new Map(
      drafts.map((draft) => [draft.work_log_id, draft.draft_data]),
    );
    return {
      invoice,
      items: invoice.items || [],
      work_logs: links.map((link) =>
        this.mergeDraftIntoWorkLog(
          link.work_log,
          draftByWorkLogId.get(link.work_log_id),
        ),
      ),
      drafts: drafts.map((draft) => ({
        id: draft.id,
        invoice_id: draft.invoice_id,
        work_log_id: draft.work_log_id,
        draft_data: draft.draft_data,
        updated_at: draft.updated_at,
      })),
    };
  }

  async getPricingDraft(invoiceId: number) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, invoice_no: true, deleted_at: true },
    });
    if (!invoice || invoice.deleted_at)
      throw new NotFoundException('發票不存在');

    const draft = await this.prisma.invoicePricingDraft.findUnique({
      where: { invoice_id: invoiceId },
    });

    return {
      invoice: { id: invoice.id, invoice_no: invoice.invoice_no },
      draft: draft
        ? {
            id: draft.id,
            invoice_id: draft.invoice_id,
            pivot_config: draft.pivot_config,
            row_prices: draft.row_prices,
            draft_items: draft.draft_items,
            updated_at: draft.updated_at,
          }
        : null,
    };
  }

  async savePricingDraft(invoiceId: number, dto: SaveInvoicePricingDraftDto) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, deleted_at: true },
    });
    if (!invoice || invoice.deleted_at)
      throw new NotFoundException('發票不存在');

    const draft = await this.prisma.invoicePricingDraft.upsert({
      where: { invoice_id: invoiceId },
      create: {
        invoice_id: invoiceId,
        pivot_config: this.toJsonInput(dto.pivot_config, {}),
        row_prices: this.toJsonInput(dto.row_prices, {}),
        draft_items: this.toJsonInput(dto.draft_items, []),
      },
      update: {
        pivot_config: this.toJsonInput(dto.pivot_config, {}),
        row_prices: this.toJsonInput(dto.row_prices, {}),
        draft_items: this.toJsonInput(dto.draft_items, []),
      },
    });

    return {
      id: draft.id,
      invoice_id: draft.invoice_id,
      pivot_config: draft.pivot_config,
      row_prices: draft.row_prices,
      draft_items: draft.draft_items,
      updated_at: draft.updated_at,
    };
  }

  async matchRates(invoiceId: number, dto: MatchInvoiceRatesDto) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });
    if (!invoice || invoice.deleted_at)
      throw new NotFoundException('發票不存在');

    const groups = dto.groups || [];
    const results: MatchRateResult[] = [];
    for (const group of groups) {
      const card = await this.matchSingleRateCard(group, invoice);
      if (!card) {
        results.push({
          ...group,
          matched: false,
          item_name: this.buildRateMatchItemName(group),
          quantity: Number(group.count) || 0,
          unit_price: null,
          unit: null,
          rate_card_id: null,
          rate_card_name: null,
        });
        continue;
      }

      const resolved = this.resolveInvoiceRate(card, group.day_night);
      results.push({
        ...group,
        matched: true,
        rate_card_id: card.id,
        rate_card_name: card.name || card.description || `RateCard #${card.id}`,
        item_name: this.buildRateMatchItemName(group),
        quantity: Number(group.count) || 0,
        unit_price: resolved.unit_price,
        unit: resolved.unit,
      });
    }
    return { results };
  }

  async updateItems(invoiceId: number, dto: UpdateInvoiceItemsDto) {
    const existing = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });
    if (!existing || existing.deleted_at)
      throw new NotFoundException('發票不存在');

    const items = dto.items || [];
    const normalizedItems = items.map((item, idx) => {
      const quantity = Number(item.quantity) || 0;
      const unitPrice = Number(item.unit_price) || 0;
      const amount =
        item.amount !== undefined && item.amount !== null
          ? Number(item.amount) || 0
          : Math.round(quantity * unitPrice * 100) / 100;
      return {
        invoice_id: invoiceId,
        item_name: item.item_name || null,
        description: item.description || null,
        quantity,
        unit: item.unit || null,
        unit_price: unitPrice,
        amount,
        sort_order: item.sort_order || idx + 1,
      };
    });

    const retentionRate = Number(existing.retention_rate) || 0;
    const otherCharges = this.normalizeOtherCharges(existing.other_charges);
    const { subtotal, retention_amount, total_amount } = this.calcTotals(
      normalizedItems,
      retentionRate,
      otherCharges,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.invoiceItem.deleteMany({ where: { invoice_id: invoiceId } });
      if (normalizedItems.length > 0)
        await tx.invoiceItem.createMany({ data: normalizedItems });
      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          subtotal,
          retention_amount,
          total_amount,
          outstanding: Math.max(
            0,
            Math.round((total_amount - Number(existing.paid_amount)) * 100) /
              100,
          ),
        },
      });
    });

    return this.prisma.invoiceItem.findMany({
      where: { invoice_id: invoiceId },
      orderBy: { sort_order: 'asc' },
    });
  }

  async updateStatus(id: number, status: string) {
    const existing = await this.prisma.invoice.findUnique({ where: { id } });
    if (!existing || existing.deleted_at)
      throw new NotFoundException('發票不存在');

    const validStatuses = ['draft', 'issued', 'partially_paid', 'paid', 'void'];
    if (!validStatuses.includes(status)) {
      throw new BadRequestException(`無效狀態: ${status}`);
    }

    return this.prisma.invoice.update({
      where: { id },
      data: { status },
      include: this.includeRelations,
    });
  }

  /**
   * Record a payment for this invoice → creates PaymentIn record
   */
  async recordPayment(
    invoiceId: number,
    dto: {
      date: string;
      amount: number;
      bank_account_id?: number | null;
      reference_no?: string;
      remarks?: string;
    },
  ) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { project: true },
    });
    if (!invoice) throw new NotFoundException('發票不存在');
    if (invoice.status === 'void')
      throw new BadRequestException('已作廢的發票無法收款');

    if (!dto.amount || dto.amount <= 0) {
      throw new BadRequestException('收款金額必須大於 0');
    }

    const paymentIn = await this.prisma.paymentIn.create({
      data: {
        date: new Date(dto.date),
        amount: dto.amount,
        source_type: 'INVOICE',
        source_ref_id: invoiceId,
        project_id: invoice.project_id || null,
        bank_account_id: dto.bank_account_id || null,
        reference_no: dto.reference_no || null,
        remarks: dto.remarks || `發票 ${invoice.invoice_no} 收款`,
      },
    });

    await this.recalcPayments(invoiceId);
    return this.findOne(invoiceId);
  }

  /**
   * Delete a payment record for this invoice
   */
  async deletePayment(invoiceId: number, paymentId: number) {
    const payment = await this.prisma.paymentIn.findUnique({
      where: { id: paymentId },
    });
    if (!payment) throw new NotFoundException('收款記錄不存在');
    if (
      payment.source_type !== 'invoice' ||
      payment.source_ref_id !== invoiceId
    ) {
      throw new BadRequestException('此收款記錄不屬於此發票');
    }

    await this.prisma.paymentIn.delete({ where: { id: paymentId } });
    await this.recalcPayments(invoiceId);

    return this.findOne(invoiceId);
  }

  /**
   * Get all payment records for this invoice
   */
  async getPayments(invoiceId: number) {
    return this.prisma.paymentIn.findMany({
      where: {
        source_type: { in: ['INVOICE', 'invoice'] },
        source_ref_id: invoiceId,
      },
      orderBy: { date: 'desc' },
    });
  }

  async delete(id: number, userId?: number, ipAddress?: string) {
    const existing = await this.prisma.invoice.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('發票不存在');
    if (existing.status === 'paid')
      throw new BadRequestException('已付款的發票無法刪除');

    if (userId) {
      try {
        await this.auditLogsService.log({
          userId,
          action: 'delete',
          targetTable: 'invoices',
          targetId: id,
          changesBefore: existing,
          ipAddress,
        });
      } catch (e) {
        console.error('Audit log error:', e);
      }
    }
    await this.prisma.invoice.update({
      where: { id },
      data: { deleted_at: new Date(), deleted_by: userId ?? null },
    });
    return { success: true };
  }
}
