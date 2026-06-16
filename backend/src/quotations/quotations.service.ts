import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AcceptQuotationDto,
  CreateQuotationDto,
  CreateQuotationRevisionDto,
  QuotationItemDto,
  SyncQuotationToRateCardsDto,
  UpdateQuotationDto,
} from './dto/create-quotation.dto';

type QuotationListQuery = {
  page?: number | string;
  limit?: number | string;
  search?: string;
  company_id?: number | string;
  client_id?: number | string;
  status?: string;
  quotation_type?: string;
  date_from?: string;
  date_to?: string;
  sortBy?: string;
  sortOrder?: string;
  [key: string]: string | number | undefined;
};

type ColumnFilters = Record<string, string[]>;

const STATUS_LABEL_TO_VALUE: Record<string, string> = {
  草稿: 'draft',
  已發送: 'sent',
  已接受: 'accepted',
  已確認: 'accepted',
  已拒絕: 'rejected',
  draft: 'draft',
  sent: 'sent',
  accepted: 'accepted',
  confirmed: 'accepted',
  rejected: 'rejected',
};

const STATUS_VALUE_TO_LABEL: Record<string, string> = {
  draft: '草稿',
  sent: '已發送',
  accepted: '已接受',
  confirmed: '已確認',
  rejected: '已拒絕',
};

const QUOTATION_TYPE_LABEL_TO_VALUE: Record<string, string> = {
  工程報價: 'project',
  '租賃/運輸報價': 'rental',
  project: 'project',
  rental: 'rental',
};

const QUOTATION_TYPE_VALUE_TO_LABEL: Record<string, string> = {
  project: '工程報價',
  rental: '租賃/運輸報價',
};

@Injectable()
export class QuotationsService {
  constructor(
    private prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  private readonly allowedSortFields = [
    'id',
    'quotation_no',
    'quotation_date',
    'project_name',
    'total_amount',
    'status',
    'created_at',
  ];

  private toNullableJson(
    value: unknown,
  ): Prisma.InputJsonValue | typeof Prisma.JsonNull {
    if (value === null || value === undefined) return Prisma.JsonNull;
    return value as Prisma.InputJsonValue;
  }

  private readonly includeRelations = {
    company: true,
    client: true,
    project: true,
    creator: { select: { id: true, displayName: true, username: true } },
    items: { orderBy: { sort_order: 'asc' as const } },
    invoices: {
      where: { deleted_at: null },
      select: { id: true, invoice_no: true },
      orderBy: { id: 'asc' as const },
    },
  };

  private getQuotationFamilyRootId(quotation: {
    id: number;
    quotation_parent_id: number | null;
  }): number {
    return quotation.quotation_parent_id ?? quotation.id;
  }

  private buildRevisionQuotationNo(
    rootQuotationNo: string,
    revisionNumber: number,
  ): string {
    const baseQuotationNo = rootQuotationNo.replace(/R\d+$/i, '');
    return `${baseQuotationNo}R${revisionNumber}`;
  }

  private parseRevisionDate(value: string | undefined, fallback: Date): Date {
    if (!value) return fallback;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('無效日期');
    }
    return date;
  }

  private calculateQuotationTotal(items: QuotationItemDto[] = []): number {
    return items.reduce((sum, item) => {
      return sum + Number(item.quantity || 0) * Number(item.unit_price || 0);
    }, 0);
  }

  private isRateOnlyItem(item: any): boolean {
    return (
      Boolean(item?.rate_only) || !item?.quantity || Number(item.quantity) === 0
    );
  }

  private isRateOnlyTotal(items: any[] = []): boolean {
    return items.length > 0 && items.every((item) => this.isRateOnlyItem(item));
  }

  private withRateOnlyTotal<T extends { items?: any[] }>(quotation: T) {
    return {
      ...quotation,
      is_rate_only_total: this.isRateOnlyTotal(quotation.items || []),
    };
  }

  /**
   * Generate quotation number:
   * Format with client code: {CompanyPrefix}Q{ClientCode}{YYMM}{4-digit hex seq}
   * Format without client code: {CompanyPrefix}Q{YYMM}{4-digit hex seq}
   */
  async generateQuotationNo(
    companyId: number,
    clientId: number | null,
    date: string,
  ): Promise<string> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company || !company.internal_prefix) {
      throw new NotFoundException('公司不存在或未設定前綴');
    }

    let clientCode = '';
    if (clientId) {
      const partner = await this.prisma.partner.findUnique({
        where: { id: clientId },
      });
      if (partner?.english_code) {
        clientCode = partner.english_code;
      }
    }

    const d = new Date(date);
    const yy = String(d.getFullYear()).slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yearMonth = `${yy}${mm}`;

    const prefix = clientCode
      ? `${company.internal_prefix}Q${clientCode}`
      : `${company.internal_prefix}Q`;

    return await this.prisma.$transaction(async (tx) => {
      let seq = await tx.quotationSequence.findFirst({
        where: { prefix, year_month: yearMonth },
      });

      if (!seq) {
        seq = await tx.quotationSequence.create({
          data: { prefix, year_month: yearMonth, last_seq: 0 },
        });
      }

      const updated = await tx.quotationSequence.update({
        where: { id: seq.id },
        data: { last_seq: seq.last_seq + 1 },
      });

      const seqHex = updated.last_seq
        .toString(16)
        .toUpperCase()
        .padStart(4, '0');
      return `${prefix}${yearMonth}${seqHex}`;
    });
  }

  /**
   * Generate project number: {公司代碼}-{年份}-P{序號}
   */
  private async generateProjectNo(companyId: number): Promise<string> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company || !company.internal_prefix) {
      throw new NotFoundException('公司不存在或未設定前綴');
    }

    const prefix = company.internal_prefix;
    const year = String(new Date().getFullYear());

    return await this.prisma.$transaction(async (tx) => {
      let seq = await tx.projectSequence.findFirst({
        where: { prefix, year },
      });

      if (!seq) {
        seq = await tx.projectSequence.create({
          data: { prefix, year, last_seq: 0 },
        });
      }

      const updated = await tx.projectSequence.update({
        where: { id: seq.id },
        data: { last_seq: seq.last_seq + 1 },
      });

      const seqStr = String(updated.last_seq).padStart(2, '0');
      return `${prefix}-${year}-P${seqStr}`;
    });
  }

  private parseColumnFilters(query: QuotationListQuery): ColumnFilters {
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

  private formatAmount(value: any): string {
    return value != null ? Number(value).toLocaleString('en') : '-';
  }

  private addFieldConditions(
    target: Prisma.QuotationWhereInput[],
    fieldConditions: Prisma.QuotationWhereInput[],
  ) {
    if (fieldConditions.length === 1) target.push(fieldConditions[0]);
    if (fieldConditions.length > 1) target.push({ OR: fieldConditions });
  }

  private buildColumnFilterWhere(
    filters: ColumnFilters,
  ): Prisma.QuotationWhereInput {
    const conditions: Prisma.QuotationWhereInput[] = [];
    const nullableStringFields = ['contract_name', 'project_name'];
    const directStringFields = ['quotation_no'];
    const directNumberFields = ['id'];

    for (const [field, values] of Object.entries(filters)) {
      if (values.includes('__NO_MATCH__')) {
        conditions.push({ id: -1 });
        continue;
      }

      const hasBlank = values.includes('-');
      const nonBlankValues = values.filter((value) => value !== '-');

      if (directStringFields.includes(field)) {
        if (nonBlankValues.length > 0) {
          conditions.push({
            [field]: { in: nonBlankValues },
          } as Prisma.QuotationWhereInput);
        }
      } else if (nullableStringFields.includes(field)) {
        const fieldConditions: Prisma.QuotationWhereInput[] = [];
        if (nonBlankValues.length > 0) {
          fieldConditions.push({
            [field]: { in: nonBlankValues },
          } as Prisma.QuotationWhereInput);
        }
        if (hasBlank) {
          fieldConditions.push({
            OR: [{ [field]: null }, { [field]: '' }],
          } as Prisma.QuotationWhereInput);
        }
        this.addFieldConditions(conditions, fieldConditions);
      } else if (directNumberFields.includes(field)) {
        const numericValues = nonBlankValues
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value));
        const fieldConditions: Prisma.QuotationWhereInput[] = [];
        if (numericValues.length > 0) {
          fieldConditions.push({
            [field]: { in: numericValues },
          } as Prisma.QuotationWhereInput);
        }
        if (hasBlank)
          fieldConditions.push({ [field]: null } as Prisma.QuotationWhereInput);
        this.addFieldConditions(conditions, fieldConditions);
      } else if (field === 'quotation_date' || field === 'created_at') {
        const dateRanges = nonBlankValues
          .map((value) => this.parseDisplayDate(value))
          .filter(
            (range): range is { start: Date; end: Date } => range !== null,
          );
        const fieldConditions: Prisma.QuotationWhereInput[] = [];
        if (dateRanges.length > 0) {
          fieldConditions.push({
            OR: dateRanges.map(
              (range) =>
                ({
                  [field]: { gte: range.start, lt: range.end },
                }) as Prisma.QuotationWhereInput,
            ),
          });
        }
        if (hasBlank)
          fieldConditions.push({ [field]: null } as Prisma.QuotationWhereInput);
        this.addFieldConditions(conditions, fieldConditions);
      } else if (field === 'total_amount') {
        const wantsRateOnly = nonBlankValues.includes('Rate Only');
        const amountValues = nonBlankValues
          .map((value) => Number(value.replace(/[$,]/g, '')))
          .filter((value) => Number.isFinite(value));
        const fieldConditions: Prisma.QuotationWhereInput[] = [];
        if (amountValues.length > 0) {
          fieldConditions.push({ total_amount: { in: amountValues } as any });
        }
        if (wantsRateOnly) {
          fieldConditions.push({
            AND: [
              { items: { some: {} } },
              {
                items: {
                  every: {
                    quantity: 0 as any,
                  },
                },
              },
            ],
          });
        }
        this.addFieldConditions(conditions, fieldConditions);
      } else if (field === 'status') {
        const rawValues = nonBlankValues.map(
          (value) => STATUS_LABEL_TO_VALUE[value] || value,
        );
        if (rawValues.length > 0)
          conditions.push({ status: { in: rawValues } });
      } else if (field === 'quotation_type') {
        const rawValues = nonBlankValues.map(
          (value) => QUOTATION_TYPE_LABEL_TO_VALUE[value] || value,
        );
        if (rawValues.length > 0)
          conditions.push({ quotation_type: { in: rawValues } });
      } else if (field === 'company') {
        const fieldConditions: Prisma.QuotationWhereInput[] = [];
        if (nonBlankValues.length > 0) {
          fieldConditions.push({
            company: {
              is: {
                OR: [
                  { internal_prefix: { in: nonBlankValues } },
                  { name: { in: nonBlankValues } },
                ],
              },
            },
          });
        }
        this.addFieldConditions(conditions, fieldConditions);
      } else if (field === 'client') {
        const fieldConditions: Prisma.QuotationWhereInput[] = [];
        if (nonBlankValues.length > 0) {
          fieldConditions.push({
            client: {
              is: {
                OR: [
                  { code: { in: nonBlankValues } },
                  { name: { in: nonBlankValues } },
                ],
              },
            },
          });
        }
        if (hasBlank) fieldConditions.push({ client_id: null });
        this.addFieldConditions(conditions, fieldConditions);
      } else if (field === 'project') {
        const fieldConditions: Prisma.QuotationWhereInput[] = [];
        if (nonBlankValues.length > 0) {
          fieldConditions.push({
            project: {
              is: {
                OR: [
                  { project_no: { in: nonBlankValues } },
                  { project_name: { in: nonBlankValues } },
                ],
              },
            },
          });
        }
        if (hasBlank) fieldConditions.push({ project_id: null });
        this.addFieldConditions(conditions, fieldConditions);
      } else if (field === 'creator') {
        const fieldConditions: Prisma.QuotationWhereInput[] = [];
        if (nonBlankValues.length > 0) {
          fieldConditions.push({
            creator: {
              is: {
                OR: [
                  { displayName: { in: nonBlankValues } },
                  { username: { in: nonBlankValues } },
                ],
              },
            },
          });
        }
        if (hasBlank) fieldConditions.push({ created_by: null });
        this.addFieldConditions(conditions, fieldConditions);
      }
    }

    return conditions.length > 0 ? { AND: conditions } : {};
  }

  private buildBaseWhere(
    query: QuotationListQuery,
    excludeFilterColumn?: string,
  ): Prisma.QuotationWhereInput {
    const where: Prisma.QuotationWhereInput = {
      deleted_at: null,
      quotation_is_active: true,
    };

    if (query.company_id) where.company_id = Number(query.company_id);
    if (query.client_id) where.client_id = Number(query.client_id);
    if (query.status && query.status !== '') where.status = query.status;
    if (query.quotation_type && query.quotation_type !== '')
      where.quotation_type = query.quotation_type;
    if (query.date_from || query.date_to) {
      where.quotation_date = {};
      if (query.date_from) {
        where.quotation_date.gte = new Date(`${query.date_from}T00:00:00.000Z`);
      }
      if (query.date_to) {
        where.quotation_date.lte = new Date(`${query.date_to}T23:59:59.999Z`);
      }
    }

    if (query.search) {
      where.OR = [
        { quotation_no: { contains: query.search, mode: 'insensitive' } },
        { contract_name: { contains: query.search, mode: 'insensitive' } },
        { project_name: { contains: query.search, mode: 'insensitive' } },
        {
          company: {
            is: { name: { contains: query.search, mode: 'insensitive' } },
          },
        },
        {
          company: {
            is: {
              internal_prefix: { contains: query.search, mode: 'insensitive' },
            },
          },
        },
        {
          client: {
            is: { name: { contains: query.search, mode: 'insensitive' } },
          },
        },
        {
          client: {
            is: { code: { contains: query.search, mode: 'insensitive' } },
          },
        },
        {
          project: {
            is: { project_no: { contains: query.search, mode: 'insensitive' } },
          },
        },
        {
          project: {
            is: {
              project_name: { contains: query.search, mode: 'insensitive' },
            },
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
  ): Prisma.QuotationOrderByWithRelationInput {
    const directSortFields = [
      'id',
      'quotation_no',
      'quotation_type',
      'quotation_date',
      'contract_name',
      'project_name',
      'total_amount',
      'status',
      'created_at',
      'updated_at',
    ];

    if (sortBy === 'company')
      return { company: { internal_prefix: sortOrder } };
    if (sortBy === 'client') return { client: { code: sortOrder } };
    if (sortBy === 'project') return { project: { project_no: sortOrder } };
    if (sortBy === 'creator') return { creator: { displayName: sortOrder } };
    if (directSortFields.includes(sortBy || '')) {
      return {
        [sortBy!]: sortOrder,
      } as Prisma.QuotationOrderByWithRelationInput;
    }

    return { id: 'desc' };
  }

  async findAll(query: QuotationListQuery) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const where = this.buildBaseWhere(query);
    const sortOrder: Prisma.SortOrder =
      query.sortOrder?.toUpperCase() === 'ASC' ? 'asc' : 'desc';
    const orderBy = this.buildOrderBy(query.sortBy, sortOrder);

    const [data, total] = await Promise.all([
      this.prisma.quotation.findMany({
        where,
        include: {
          company: true,
          client: true,
          project: true,
          creator: { select: { id: true, displayName: true, username: true } },
          items: { select: { quantity: true }, orderBy: { sort_order: 'asc' } },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.quotation.count({ where }),
    ]);

    return {
      data: data.map((quotation) => this.withRateOnlyTotal(quotation)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getFilterOptions(
    column: string,
    query: QuotationListQuery,
  ): Promise<string[]> {
    const where = this.buildBaseWhere(query, column);
    const stringColumns = ['quotation_no', 'contract_name', 'project_name'];
    const dateColumns = ['quotation_date', 'created_at'];

    if (stringColumns.includes(column)) {
      const records = await this.prisma.quotation.findMany({
        where,
        select: { [column]: true } as any,
        distinct: [column as any],
        orderBy: { [column]: 'asc' } as any,
      });
      const values = records.map((record: any) => record[column] || '-');
      return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    }

    if (column === 'id') {
      const records = await this.prisma.quotation.findMany({
        where,
        select: { id: true },
        distinct: ['id'],
        orderBy: { id: 'asc' },
      });
      return records.map((record) => String(record.id));
    }

    if (dateColumns.includes(column)) {
      const records = await this.prisma.quotation.findMany({
        where,
        select: { [column]: true } as any,
        orderBy: { [column]: 'desc' } as any,
      });
      const values = records.map((record: any) =>
        this.formatDisplayDate(record[column]),
      );
      return [...new Set(values)];
    }

    if (column === 'total_amount') {
      const records = await this.prisma.quotation.findMany({
        where,
        select: {
          total_amount: true,
          items: { select: { quantity: true } },
        },
        orderBy: { total_amount: 'asc' },
      });
      const values = records.map((record) =>
        this.isRateOnlyTotal(record.items)
          ? 'Rate Only'
          : this.formatAmount(record.total_amount),
      );
      return [...new Set(values)];
    }

    if (column === 'status') {
      const records = await this.prisma.quotation.findMany({
        where,
        select: { status: true },
        distinct: ['status'],
        orderBy: { status: 'asc' },
      });
      const values = records.map(
        (record) =>
          STATUS_VALUE_TO_LABEL[record.status] || record.status || '-',
      );
      return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    }

    if (column === 'quotation_type') {
      const records = await this.prisma.quotation.findMany({
        where,
        select: { quotation_type: true },
        distinct: ['quotation_type'],
        orderBy: { quotation_type: 'asc' },
      });
      const values = records.map(
        (record) =>
          QUOTATION_TYPE_VALUE_TO_LABEL[record.quotation_type] ||
          record.quotation_type ||
          '-',
      );
      return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    }

    if (column === 'company') {
      const records = await this.prisma.quotation.findMany({
        where,
        include: { company: { select: { internal_prefix: true, name: true } } },
        distinct: ['company_id'],
      });
      const values = records.map(
        (record) =>
          record.company?.internal_prefix || record.company?.name || '-',
      );
      return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    }

    if (column === 'client') {
      const records = await this.prisma.quotation.findMany({
        where,
        include: { client: { select: { code: true, name: true } } },
        distinct: ['client_id'],
      });
      const values = records.map(
        (record) => record.client?.code || record.client?.name || '-',
      );
      return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    }

    if (column === 'project') {
      const records = await this.prisma.quotation.findMany({
        where,
        include: {
          project: { select: { project_no: true, project_name: true } },
        },
        distinct: ['project_id'],
      });
      const values = records.map(
        (record) =>
          record.project?.project_no || record.project?.project_name || '-',
      );
      return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    }

    if (column === 'creator') {
      const records = await this.prisma.quotation.findMany({
        where,
        include: { creator: { select: { displayName: true, username: true } } },
        distinct: ['created_by'],
      });
      const values = records.map(
        (record) => record.creator?.displayName || record.creator?.username || '-',
      );
      return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    }

    return [];
  }

  async findOne(id: number) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id },
      include: this.includeRelations,
    });
    if (!quotation || quotation.deleted_at)
      throw new NotFoundException('報價單不存在');
    return this.withRateOnlyTotal(quotation);
  }

  async createRevision(id: number, dto: CreateQuotationRevisionDto = {}) {
    const source = await this.prisma.quotation.findUnique({
      where: { id },
      include: { items: { orderBy: { sort_order: 'asc' } } },
    });
    if (!source || source.deleted_at) {
      throw new NotFoundException('報價單不存在');
    }

    const rootQuotationId = this.getQuotationFamilyRootId(source);

    return this.prisma.$transaction(async (tx) => {
      const latestRevision = await tx.quotation.findFirst({
        where: {
          deleted_at: null,
          OR: [
            { id: rootQuotationId },
            { quotation_parent_id: rootQuotationId },
          ],
        },
        orderBy: [{ quotation_revision_number: 'desc' }, { id: 'desc' }],
        select: { quotation_revision_number: true },
      });
      const revisionNumber =
        (latestRevision?.quotation_revision_number ?? 0) + 1;

      const rootQuotation =
        source.id === rootQuotationId
          ? { quotation_no: source.quotation_no }
          : await tx.quotation.findUnique({
              where: { id: rootQuotationId },
              select: { quotation_no: true },
            });
      if (!rootQuotation) {
        throw new NotFoundException('原始報價單不存在');
      }

      const quotationNo =
        dto.quotation_no?.trim() ||
        this.buildRevisionQuotationNo(
          rootQuotation.quotation_no,
          revisionNumber,
        );

      return tx.quotation.create({
        data: {
          quotation_no: quotationNo,
          quotation_parent_id: rootQuotationId,
          quotation_revision_number: revisionNumber,
          quotation_is_active: false,
          quotation_type: source.quotation_type,
          company_id: source.company_id,
          client_id: source.client_id,
          quotation_date: this.parseRevisionDate(
            dto.quotation_date || dto.date,
            source.quotation_date,
          ),
          contract_name: source.contract_name,
          project_name: source.project_name,
          project_id: source.project_id,
          total_amount: source.total_amount,
          status: source.status,
          validity_period: source.validity_period,
          payment_terms: source.payment_terms,
          exclusions: source.exclusions,
          external_remark: source.external_remark,
          internal_remark: source.internal_remark,
          items: {
            create: source.items.map((item) => ({
              sort_order: item.sort_order,
              item_name: item.item_name,
              item_description: item.item_description,
              quantity: item.quantity,
              unit: item.unit,
              unit_price: item.unit_price,
              amount: item.amount,
              remarks: item.remarks,
            })),
          },
        },
        include: this.includeRelations,
      });
    });
  }

  async setActive(id: number) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id },
      select: { id: true, quotation_parent_id: true, deleted_at: true },
    });
    if (!quotation || quotation.deleted_at) {
      throw new NotFoundException('報價單不存在');
    }

    const rootQuotationId = this.getQuotationFamilyRootId(quotation);
    return this.prisma.$transaction(async (tx) => {
      await tx.quotation.updateMany({
        where: {
          deleted_at: null,
          OR: [
            { id: rootQuotationId },
            { quotation_parent_id: rootQuotationId },
          ],
        },
        data: { quotation_is_active: false },
      });

      return tx.quotation.update({
        where: { id },
        data: { quotation_is_active: true },
        include: this.includeRelations,
      });
    });
  }

  async getRevisions(id: number) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id },
      select: { id: true, quotation_parent_id: true, deleted_at: true },
    });
    if (!quotation || quotation.deleted_at) {
      throw new NotFoundException('報價單不存在');
    }

    const rootQuotationId = this.getQuotationFamilyRootId(quotation);
    const revisions = await this.prisma.quotation.findMany({
      where: {
        deleted_at: null,
        OR: [{ id: rootQuotationId }, { quotation_parent_id: rootQuotationId }],
      },
      include: this.includeRelations,
      orderBy: [{ quotation_revision_number: 'asc' }, { id: 'asc' }],
    });

    return revisions.map((revision) => this.withRateOnlyTotal(revision));
  }

  async create(dto: CreateQuotationDto, userId?: number, ipAddress?: string) {
    const {
      items,
      company,
      client,
      project,
      quotation_parent_id,
      quotation_revision_number,
      quotation_is_active,
      date,
      pdf_font_sizes,
      ...quotationData
    } = dto as CreateQuotationDto & {
      company?: unknown;
      client?: unknown;
      project?: unknown;
      quotation_parent_id?: number;
      quotation_revision_number?: number;
      quotation_is_active?: boolean;
      date?: string;
      pdf_font_sizes?: Record<string, unknown>;
    };

    if (quotationData.company_id === undefined) {
      throw new BadRequestException('公司為必填欄位');
    }

    const quotationDate =
      quotationData.quotation_date || date || new Date().toISOString();

    // Generate quotation number
    const quotation_no = await this.generateQuotationNo(
      quotationData.company_id,
      quotationData.client_id ?? null,
      quotationDate,
    );

    // Calculate total
    let total_amount = 0;
    const processedItems: (QuotationItemDto & {
      amount: number;
      sort_order: number;
    })[] = [];
    if (items && items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const amount =
          Number(item.quantity || 0) * Number(item.unit_price || 0);
        total_amount += amount;
        processedItems.push({
          ...item,
          amount,
          sort_order: item.sort_order || i + 1,
          id: undefined,
        });
      }
    }

    const saved = await this.prisma.quotation.create({
      data: {
        ...quotationData,
        company_id: quotationData.company_id,
        quotation_no,
        total_amount,
        quotation_date: new Date(quotationDate),
        quotation_parent_id: null,
        quotation_revision_number: 0,
        quotation_is_active: true,
        created_by: userId ?? null,
        ...(pdf_font_sizes !== undefined
          ? { pdf_font_sizes: this.toNullableJson(pdf_font_sizes) }
          : {}),
        items:
          processedItems.length > 0
            ? {
                create: processedItems.map(
                  ({ id: _id, quotation_id: _qid, ...item }) => item,
                ),
              }
            : undefined,
      },
    });

    if (userId) {
      try {
        await this.auditLogsService.log({
          userId,
          action: 'create',
          targetTable: 'quotations',
          targetId: saved.id,
          changesAfter: saved,
          ipAddress,
        });
      } catch (e) {
        console.error('Audit log error:', e);
      }
    }

    return this.findOne(saved.id);
  }

  async update(
    id: number,
    dto: UpdateQuotationDto,
    userId?: number,
    ipAddress?: string,
  ) {
    const existing = await this.prisma.quotation.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('報價單不存在');

    const {
      items,
      company,
      client,
      project,
      created_at,
      updated_at,
      deleted_at,
      deleted_by,
      id: _id,
      quotation_parent_id,
      quotation_revision_number,
      quotation_is_active,
      date,
      pdf_font_sizes,
      ...updateData
    } = dto as UpdateQuotationDto & {
      company?: unknown;
      client?: unknown;
      project?: unknown;
      created_at?: unknown;
      updated_at?: unknown;
      deleted_at?: unknown;
      deleted_by?: unknown;
      id?: number;
      quotation_parent_id?: number;
      quotation_revision_number?: number;
      quotation_is_active?: boolean;
      date?: string;
      pdf_font_sizes?: Record<string, unknown>;
    };

    // Recalculate total
    if (items && items.length > 0) {
      let total_amount = 0;
      for (const item of items) {
        item.amount = Number(item.quantity || 0) * Number(item.unit_price || 0);
        total_amount += item.amount;
      }
      updateData.total_amount = total_amount;
    }

    const updatePayload: Prisma.QuotationUncheckedUpdateInput = {
      ...updateData,
    };
    if (pdf_font_sizes !== undefined) {
      updatePayload.pdf_font_sizes = this.toNullableJson(pdf_font_sizes);
    }
    if (updateData.quotation_date) {
      updatePayload.quotation_date = new Date(updateData.quotation_date);
    }

    await this.prisma.quotation.update({ where: { id }, data: updatePayload });

    // Replace items if provided
    if (items !== undefined) {
      await this.prisma.quotationItem.deleteMany({
        where: { quotation_id: id },
      });
      if (items.length > 0) {
        await this.prisma.quotationItem.createMany({
          data: items.map((item: QuotationItemDto, index: number) => ({
            quotation_id: id,
            item_name: item.item_name,
            item_description: item.item_description,
            quantity: item.quantity || 0,
            unit: item.unit,
            unit_price: item.unit_price || 0,
            amount: item.amount || 0,
            remarks: item.remarks,
            sort_order: item.sort_order || index + 1,
            qi_service_type: item.qi_service_type || null,
            qi_day_night: item.qi_day_night || null,
            qi_tonnage: item.qi_tonnage || null,
            qi_machine_type: item.qi_machine_type || null,
            qi_origin: item.qi_origin || null,
            qi_destination: item.qi_destination || null,
            qi_ot_rate: item.qi_ot_rate ? Number(item.qi_ot_rate) : null,
            qi_mid_shift_rate: item.qi_mid_shift_rate ? Number(item.qi_mid_shift_rate) : null,
            qi_sync_to_rate_card: item.qi_sync_to_rate_card || false,
          })),
        });
      }
    }

    if (userId) {
      try {
        const afterQ = await this.prisma.quotation.findUnique({
          where: { id },
        });
        await this.auditLogsService.log({
          userId,
          action: 'update',
          targetTable: 'quotations',
          targetId: id,
          changesBefore: existing,
          changesAfter: afterQ,
          ipAddress,
        });
      } catch (e) {
        console.error('Audit log error:', e);
      }
    }
    return this.findOne(id);
  }

  async updateStatus(id: number, status: string) {
    const existing = await this.prisma.quotation.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('報價單不存在');
    await this.prisma.quotation.update({ where: { id }, data: { status } });

    // Cascade status to all three rate card tables when cancelled or rejected
    if (status === 'cancelled' || status === 'rejected') {
      await this.prisma.rateCard.updateMany({
        where: { source_quotation_id: id },
        data: { status: 'cancelled' },
      });
      await this.prisma.fleetRateCard.updateMany({
        where: { source_quotation_id: id },
        data: { status: 'cancelled' },
      });
      await this.prisma.subconRateCard.updateMany({
        where: { source_quotation_id: id },
        data: { status: 'cancelled' },
      });
    }

    return this.findOne(id);
  }

  async remove(id: number, userId?: number, ipAddress?: string) {
    const existing = await this.prisma.quotation.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('報價單不存在');

    // Cascade deleted status to all three rate card tables before removing
    await this.prisma.rateCard.updateMany({
      where: { source_quotation_id: id },
      data: { status: 'deleted' },
    });
    await this.prisma.fleetRateCard.updateMany({
      where: { source_quotation_id: id },
      data: { status: 'deleted' },
    });
    await this.prisma.subconRateCard.updateMany({
      where: { source_quotation_id: id },
      data: { status: 'deleted' },
    });

    if (userId) {
      try {
        await this.auditLogsService.log({
          userId,
          action: 'delete',
          targetTable: 'quotations',
          targetId: id,
          changesBefore: existing,
          ipAddress,
        });
      } catch (e) {
        console.error('Audit log error:', e);
      }
    }
    await this.prisma.quotation.update({
      where: { id },
      data: { deleted_at: new Date(), deleted_by: userId ?? null },
    });
    return { success: true };
  }

  /**
   * Accept a quotation and generate related records
   */
  async acceptQuotation(id: number, options?: AcceptQuotationDto) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id },
      include: { company: true, client: true, items: true },
    });
    if (!quotation) throw new NotFoundException('報價單不存在');
    if (quotation.status === 'accepted') {
      throw new BadRequestException('報價單已經被接受');
    }

    await this.prisma.quotation.update({
      where: { id },
      data: { status: 'accepted' },
    });

    let projectId: number | null = null;

    // For project type: create a project
    if (quotation.quotation_type === 'project') {
      const project_no = await this.generateProjectNo(quotation.company_id);
      const project = await this.prisma.project.create({
        data: {
          project_no,
          project_name:
            options?.project_name ||
            quotation.project_name ||
            quotation.quotation_no,
          company_id: quotation.company_id,
          client_id: quotation.client_id,
          status: 'active',
        },
      });
      projectId = project.id;
      await this.prisma.quotation.update({
        where: { id },
        data: { project_id: projectId },
      });
    }

    // Generate rate card records from quotation items (all 3 tables)
    if (quotation.items && quotation.items.length > 0) {
      for (const item of quotation.items) {
        const itemName = item.item_name || '';
        const contractNo = quotation.contract_name || undefined;
        const effectiveDate = options?.effective_date
          ? new Date(options.effective_date)
          : quotation.quotation_date;
        const expiryDate = options?.expiry_date
          ? new Date(options.expiry_date)
          : undefined;

        // 1. 客戶價目表
        if (item.qi_sync_to_rate_card) {
          const rc = await this.prisma.rateCard.create({
            data: {
              company_id: quotation.company_id,
              client_id: quotation.client_id!,
              contract_no: contractNo,
              name: itemName,
              description: item.item_description || undefined,
              service_type:
                item.qi_service_type ||
                (quotation.quotation_type === 'project' ? '工程' : '租賃/運輸'),
              rate_card_type:
                quotation.quotation_type === 'project' ? 'project' : 'rental',
              day_night: item.qi_day_night,
              tonnage: item.qi_tonnage,
              machine_type: item.qi_machine_type,
              origin: item.qi_origin,
              destination: item.qi_destination,
              rate: Number(item.unit_price) || 0,
              unit: item.unit,
              day_rate: Number(item.unit_price) || 0,
              day_unit: item.unit,
              ot_rate: Number(item.qi_ot_rate) || 0,
              ot_unit: item.qi_ot_rate ? '小時' : null,
              mid_shift_rate: Number(item.qi_mid_shift_rate) || 0,
              mid_shift_unit: item.qi_mid_shift_rate ? '小時' : null,
              effective_date: effectiveDate,
              expiry_date: expiryDate,
              source_quotation_id: quotation.id,
              project_id: projectId || undefined,
              remarks: item.remarks || undefined,
              status: 'active',
            },
          });

          try {
            await this.auditLogsService.log({
              userId: quotation.deleted_by || 0, // Fallback to system if unknown
              action: 'create',
              targetTable: 'rate_cards',
              targetId: rc.id,
              changesAfter: rc,
              remarks: `報價單同步 ${quotation.quotation_no}`,
            });
          } catch (e) {
            console.error('Audit log error:', e);
          }
        }

        // 2. 租賃價目表
        if (item.qi_sync_to_rate_card) {
          const frc = await this.prisma.fleetRateCard.create({
            data: {
              client_id: quotation.client_id,
              contract_no: contractNo,
              service_type: item.qi_service_type,
              day_night: item.qi_day_night,
              tonnage: item.qi_tonnage,
              machine_type: item.qi_machine_type,
              origin: item.qi_origin,
              destination: item.qi_destination,
              day_rate: 0,
              night_rate: 0,
              mid_shift_rate: Number(item.qi_mid_shift_rate) || 0,
              ot_rate: Number(item.qi_ot_rate) || 0,
              unit: item.unit,
              remarks: item.remarks || undefined,
              source_quotation_id: quotation.id,
              status: 'active',
            },
          });
          try {
            await this.auditLogsService.log({
              userId: quotation.deleted_by || 0,
              action: 'create',
              targetTable: 'fleet_rate_cards',
              targetId: frc.id,
              changesAfter: frc,
              remarks: `報價單同步 ${quotation.quotation_no}`,
            });
          } catch (e) {
            console.error('Audit log error:', e);
          }
        }

        // 3. 供應商價目表
        if (item.qi_sync_to_rate_card) {
          const src = await this.prisma.subconRateCard.create({
            data: {
              client_id: quotation.client_id,
              contract_no: contractNo,
              service_type: item.qi_service_type,
              day_night: item.qi_day_night,
              tonnage: item.qi_tonnage,
              machine_type: item.qi_machine_type,
              origin: item.qi_origin,
              destination: item.qi_destination,
              day_rate: 0,
              unit: item.unit,
              remarks: item.remarks || undefined,
              source_quotation_id: quotation.id,
              status: 'active',
            },
          });
          try {
            await this.auditLogsService.log({
              userId: quotation.deleted_by || 0,
              action: 'create',
              targetTable: 'subcon_rate_cards',
              targetId: src.id,
              changesAfter: src,
              remarks: `報價單同步 ${quotation.quotation_no}`,
            });
          } catch (e) {
            console.error('Audit log error:', e);
          }
        }
      }
    }

    return this.findOne(id);
  }

  /**
   * Sync quotation items to rate cards (price list)
   */
  async syncToRateCards(id: number, options?: SyncQuotationToRateCardsDto) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id },
      include: { company: true, client: true, items: true },
    });
    if (!quotation) throw new NotFoundException('報價單不存在');

    const results: {
      created: number;
      overwritten: number;
      skipped: number;
      conflicts: { item_name: string; existing_id: number }[];
    } = { created: 0, overwritten: 0, skipped: 0, conflicts: [] };

    if (!quotation.items || quotation.items.length === 0) {
      return results;
    }

    for (const item of quotation.items) {
      if (!item.qi_sync_to_rate_card) {
        results.skipped++;
        continue;
      }
      const itemName = item.item_name || '';
      const rateCardType =
        quotation.quotation_type === 'project' ? 'project' : 'rental';
      const contractNo = quotation.contract_name || undefined;
      const effectiveDate = options?.effective_date
        ? new Date(options.effective_date)
        : quotation.quotation_date;
      const expiryDate = options?.expiry_date
        ? new Date(options.expiry_date)
        : undefined;

      // Check for existing duplicate
      const existing = await this.prisma.rateCard.findFirst({
        where: {
          client_id: quotation.client_id!,
          name: itemName,
          rate_card_type: rateCardType,
          // 加入詳細配對欄位作為重複檢查條件
          service_type: item.qi_service_type || undefined,
          day_night: item.qi_day_night || undefined,
          tonnage: item.qi_tonnage || undefined,
          machine_type: item.qi_machine_type || undefined,
          origin: item.qi_origin || undefined,
          destination: item.qi_destination || undefined,
        },
      });

      if (existing && !options?.overwrite) {
        results.conflicts.push({
          item_name: itemName,
          existing_id: existing.id,
        });
        results.skipped++;
        continue;
      }

      const rateCardData: Prisma.RateCardUncheckedCreateInput = {
        company_id: quotation.company_id,
        client_id: quotation.client_id!,
        contract_no: contractNo,
        name: itemName,
        description: item.item_description || undefined,
        service_type:
          item.qi_service_type ||
          (quotation.quotation_type === 'project' ? '工程' : '租賃/運輸'),
        rate_card_type: rateCardType,
        day_night: item.qi_day_night,
        tonnage: item.qi_tonnage,
        machine_type: item.qi_machine_type,
        origin: item.qi_origin,
        destination: item.qi_destination,
        rate: Number(item.unit_price) || 0,
        unit: item.unit,
        day_rate: Number(item.unit_price) || 0,
        day_unit: item.unit,
        ot_rate: Number(item.qi_ot_rate) || 0,
        ot_unit: item.qi_ot_rate ? '小時' : null,
        mid_shift_rate: Number(item.qi_mid_shift_rate) || 0,
        mid_shift_unit: item.qi_mid_shift_rate ? '小時' : null,
        effective_date: effectiveDate,
        expiry_date: expiryDate,
        source_quotation_id: quotation.id,
        remarks: item.remarks || undefined,
        status: 'active',
      };

      if (existing && options?.overwrite) {
        const updated = await this.prisma.rateCard.update({
          where: { id: existing.id },
          data: rateCardData,
        });
        results.overwritten++;
        try {
          await this.auditLogsService.log({
            userId: 0,
            action: 'update',
            targetTable: 'rate_cards',
            targetId: updated.id,
            changesBefore: existing,
            changesAfter: updated,
            remarks: `報價單同步 ${quotation.quotation_no}`,
          });
        } catch (e) {
          console.error('Audit log error:', e);
        }
      } else {
        const created = await this.prisma.rateCard.create({
          data: rateCardData,
        });
        results.created++;
        try {
          await this.auditLogsService.log({
            userId: 0,
            action: 'create',
            targetTable: 'rate_cards',
            targetId: created.id,
            changesAfter: created,
            remarks: `報價單同步 ${quotation.quotation_no}`,
          });
        } catch (e) {
          console.error('Audit log error:', e);
        }
      }

      // 2. 租賃價目表
      const existingFleet = await this.prisma.fleetRateCard.findFirst({
        where: {
          client_id: quotation.client_id,
          source_quotation_id: quotation.id,
          service_type: item.qi_service_type || undefined,
          day_night: item.qi_day_night || undefined,
          tonnage: item.qi_tonnage || undefined,
          machine_type: item.qi_machine_type || undefined,
        },
      });
      if (!existingFleet || options?.overwrite) {
        const fleetData: Prisma.FleetRateCardUncheckedCreateInput = {
          client_id: quotation.client_id,
          contract_no: contractNo,
          service_type: item.qi_service_type,
          day_night: item.qi_day_night,
          tonnage: item.qi_tonnage,
          machine_type: item.qi_machine_type,
          origin: item.qi_origin,
          destination: item.qi_destination,
          day_rate: 0,
          night_rate: 0,
          mid_shift_rate: Number(item.qi_mid_shift_rate) || 0,
          ot_rate: Number(item.qi_ot_rate) || 0,
          unit: item.unit,
          remarks: item.remarks || undefined,
          source_quotation_id: quotation.id,
          status: 'active',
        };
        if (existingFleet && options?.overwrite) {
          const updated = await this.prisma.fleetRateCard.update({
            where: { id: existingFleet.id },
            data: fleetData,
          });
          try {
            await this.auditLogsService.log({
              userId: 0,
              action: 'update',
              targetTable: 'fleet_rate_cards',
              targetId: updated.id,
              changesBefore: existingFleet,
              changesAfter: updated,
              remarks: `報價單同步 ${quotation.quotation_no}`,
            });
          } catch (e) {
            console.error('Audit log error:', e);
          }
        } else {
          const created = await this.prisma.fleetRateCard.create({
            data: fleetData,
          });
          try {
            await this.auditLogsService.log({
              userId: 0,
              action: 'create',
              targetTable: 'fleet_rate_cards',
              targetId: created.id,
              changesAfter: created,
              remarks: `報價單同步 ${quotation.quotation_no}`,
            });
          } catch (e) {
            console.error('Audit log error:', e);
          }
        }
      }

      // 3. 供應商價目表
      const existingSubcon = await this.prisma.subconRateCard.findFirst({
        where: {
          client_id: quotation.client_id,
          source_quotation_id: quotation.id,
        },
      });
      if (!existingSubcon || options?.overwrite) {
        const subconData: Prisma.SubconRateCardUncheckedCreateInput = {
          client_id: quotation.client_id,
          contract_no: contractNo,
          day_rate: 0,
          night_rate: 0,
          mid_shift_rate: 0,
          ot_rate: 0,
          unit: item.unit,
          remarks: item.remarks || undefined,
          source_quotation_id: quotation.id,
          status: 'active',
        };
        if (existingSubcon && options?.overwrite) {
          await this.prisma.subconRateCard.update({
            where: { id: existingSubcon.id },
            data: subconData,
          });
        } else {
          await this.prisma.subconRateCard.create({ data: subconData });
        }
      }
    }

    return results;
  }

  /**
   * Get quotations linked to a specific project
   */
  async findByProject(projectId: number) {
    return this.prisma.quotation.findMany({
      where: {
        project_id: projectId,
        deleted_at: null,
        quotation_is_active: true,
      },
      include: { company: true, client: true },
      orderBy: { created_at: 'desc' },
    });
  }
}
