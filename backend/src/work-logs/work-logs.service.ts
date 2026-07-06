import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { WorkLog } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../common/pricing.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { OrderByClause, WhereClause, WorkLogQuery } from '../common/types';
import { formatHongKongDate } from '../common/date.helper';
import { WorkLogsGateway } from './work-logs.gateway';
import { AiKnowledgeCandidateService } from '../ai-knowledge/ai-knowledge-candidate.service';
import { DailyReportVerificationService } from '../verification/daily-report-verification.service';
import {
  UnmatchedCombinationsQueryDto,
  AddRateAndRematchDto,
  UnmatchedCombinationRow,
  UnmatchedCombinationsResult,
} from './dto/unmatched-combinations.dto';
import {
  PIVOT_DIMENSIONS,
  PIVOT_VALUE_TYPES,
  PivotAxisItem,
  PivotDimension,
  PivotFilterOption,
  PivotMetric,
  PivotValueType,
  WorkLogPivotFilterOptions,
  WorkLogPivotQueryDto,
  WorkLogPivotResult,
  WorkLogPivotSummary,
} from './dto/work-log-pivot.dto';

interface PivotNamedRelation {
  name?: string | null;
  name_zh?: string | null;
  short_name?: string | null;
  internal_prefix?: string | null;
  contract_no?: string | null;
  quotation_no?: string | null;
  chinese_name?: string | null;
  english_name?: string | null;
  code?: string | null;
}

interface PivotWorkLogRecord {
  id: number;
  status: string;
  scheduled_date: Date | null;
  client_contract_no: string | null;
  service_type: string | null;
  company_id: number | null;
  client_id: number | null;
  employee_id: number | null;
  work_log_fleet_driver_id: number | null;
  machine_type: string | null;
  equipment_number: string | null;
  tonnage: string | null;
  day_night: string | null;
  start_location: string | null;
  end_location: string | null;
  quantity: unknown;
  unit: string | null;
  goods_quantity: unknown;
  ot_quantity: unknown;
  ot_unit: string | null;
  is_mid_shift: boolean;
  is_confirmed: boolean;
  price_match_status: string | null;
  matched_rate_card_id: number | null;
  company: PivotNamedRelation | null;
  company_profile: PivotNamedRelation | null;
  client: PivotNamedRelation | null;
  quotation: PivotNamedRelation | null;
  contract: PivotNamedRelation | null;
  employee: PivotNamedRelation | null;
  fleet_driver: PivotNamedRelation | null;
}

interface PivotAccumulator {
  value: number;
  units: Map<string, number>;
}

interface PivotAxisParts {
  values: string[];
  labels: string[];
  key: string;
}

// 車輛類機種
const VEHICLE_TYPES = [
  '平斗',
  '勾斗',
  '夾斗',
  '拖頭',
  '車斗',
  '貨車',
  '輕型貨車',
  '私家車',
  '燈車',
];
// 機械類機種
const MACHINERY_TYPES = ['挖掘機', '火轆'];

const WHATSAPP_WORK_LOG_SOURCE = 'whatsapp_clockin';
const WORK_LOG_KNOWLEDGE_LEARNING_FIELDS = [
  'client_id',
  'start_location',
  'end_location',
  'tonnage',
  'machine_type',
  'day_night',
  'service_type',
  'equipment_number',
  'quantity',
  'remarks',
  'employee_id',
] as const;

type WorkLogKnowledgeLearningField =
  (typeof WORK_LOG_KNOWLEDGE_LEARNING_FIELDS)[number];

@Injectable()
export class WorkLogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricingService: PricingService,
    private readonly auditLogsService: AuditLogsService,
    private readonly workLogsGateway: WorkLogsGateway,
    private readonly aiKnowledgeCandidateService: AiKnowledgeCandidateService,
    private readonly dailyReportVerificationService: DailyReportVerificationService,
  ) {}

  private formatKnowledgeValue(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'object') {
      const stringifiable = value as { toString?: () => string };
      const stringValue = stringifiable.toString?.();
      if (stringValue && stringValue !== '[object Object]') return stringValue;
      return JSON.stringify(value);
    }
    return String(value);
  }

  private getKnowledgeComparableValue(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object') {
      const stringifiable = value as { toString?: () => string };
      const stringValue = stringifiable.toString?.();
      if (stringValue && stringValue !== '[object Object]') return stringValue;
      return JSON.stringify(value);
    }
    return String(value);
  }

  private async createKnowledgeCandidatesFromWorkLogCorrection(
    before: WorkLog | null,
    after: WorkLog | null,
    userId?: number,
  ): Promise<void> {
    if (!before || !after || !userId) return;
    if (before.source !== WHATSAPP_WORK_LOG_SOURCE) return;

    try {
      const employeeId = after.employee_id ?? before.employee_id;
      const scheduledDate = after.scheduled_date ?? before.scheduled_date;
      const whatsappReportedAt =
        after.wl_whatsapp_reported_at ?? before.wl_whatsapp_reported_at;

      await Promise.all(
        WORK_LOG_KNOWLEDGE_LEARNING_FIELDS.map(async (fieldName) => {
          const beforeValue = before[fieldName];
          const afterValue = after[fieldName];
          if (
            this.getKnowledgeComparableValue(beforeValue) ===
            this.getKnowledgeComparableValue(afterValue)
          ) {
            return;
          }

          await this.aiKnowledgeCandidateService.createCandidateFromCorrection({
            moduleCode: 'whatsapp-worklog',
            taskType: 'work_log_correction',
            sourceEntityType: 'work_log',
            sourceEntityId: after.id,
            fieldName,
            beforeValue: this.formatKnowledgeValue(beforeValue),
            afterValue: this.formatKnowledgeValue(afterValue),
            confirmedBy: userId,
            summary: `WhatsApp 報工工作紀錄 ${after.id} 的「${fieldName}」欄位經人工修正。`,
            extraPayload: {
              employee_id: employeeId,
              scheduled_date: scheduledDate?.toISOString() ?? null,
              whatsapp_reported_at: whatsappReportedAt?.toISOString() ?? null,
              source: before.source,
              corrected_field: fieldName,
              work_log_id: after.id,
            },
            entityType: employeeId ? 'employee' : undefined,
            entityId: employeeId ?? undefined,
          });
        }),
      );
    } catch (error) {
      console.error('AI knowledge candidate error:', error);
    }
  }

  private async assertVehicleIsNotScrappedByWorkLogData(data: any) {
    const vehicleId = data.work_log_vehicle_id
      ? Number(data.work_log_vehicle_id)
      : null;
    const equipmentNumber = data.equipment_number
      ? String(data.equipment_number)
      : null;
    if (!vehicleId && !equipmentNumber) return;
    const vehicle = await this.prisma.vehicle.findFirst({
      where: vehicleId
        ? { id: vehicleId }
        : { plate_number: equipmentNumber as string },
      select: { id: true, plate_number: true, status: true },
    });
    if (vehicle?.status === 'scrapped') {
      throw new BadRequestException(
        `已劏車的車輛${vehicle.plate_number ? `（${vehicle.plate_number}）` : ''}不能新增或更新工作紀錄`,
      );
    }
  }

  // ── 工作記錄 CRUD ──────────────────────────────────────────

  private buildWorkLogWhere(
    query: WorkLogQuery,
    excludeColumnFilter?: string,
  ): WhereClause {
    const {
      publisher_id,
      status,
      company_profile_id,
      company_id,
      client_id,
      quotation_id,
      contract_id,
      employee_id,
      equipment_number,
      date_from,
      date_to,
      start_location,
      end_location,
      work_order_no,
      receipt_no,
      work_log_product_name,
    } = query;

    // Helper: parse comma-separated string or single value into Prisma filter
    const toFilter = (val: string | number | undefined, toNum = true) => {
      if (!val) return undefined;
      const parts = String(val)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.length === 0) return undefined;
      if (parts.length === 1) return toNum ? Number(parts[0]) : parts[0];
      return { in: toNum ? parts.map(Number) : parts };
    };
    const toStrFilter = (val: string | number | undefined) =>
      toFilter(val, false);

    const where: WhereClause = { deleted_at: null };
    const pubFilter = toFilter(publisher_id);
    if (pubFilter !== undefined) where.publisher_id = pubFilter;
    const statusFilter = toStrFilter(status);
    if (statusFilter !== undefined) where.status = statusFilter;
    if (company_profile_id)
      where.company_profile_id = Number(company_profile_id);
    const companyFilter = toFilter(company_id);
    if (companyFilter !== undefined) where.company_id = companyFilter;
    const clientFilter = toFilter(client_id);
    if (clientFilter !== undefined) where.client_id = clientFilter;
    const quotationFilter = toFilter(quotation_id);
    if (quotationFilter !== undefined) where.quotation_id = quotationFilter;
    const contractFilter = toFilter(contract_id);
    if (contractFilter !== undefined) where.contract_id = contractFilter;
    const empFilter = toFilter(employee_id);
    if (empFilter !== undefined) where.employee_id = empFilter;
    if (query.project_id) where.project_id = Number(query.project_id);
    const fleetFilter = toFilter(query.fleet_driver_id);
    if (fleetFilter !== undefined) where.work_log_fleet_driver_id = fleetFilter;
    if (equipment_number)
      where.equipment_number = {
        contains: equipment_number,
        mode: 'insensitive',
      };
    if (date_from || date_to) {
      where.scheduled_date = {};
      if (date_from) where.scheduled_date.gte = new Date(date_from);
      if (date_to) where.scheduled_date.lte = new Date(date_to);
    }

    if (start_location) {
      where.start_location = {
        contains: String(start_location),
        mode: 'insensitive',
      };
    }
    if (end_location) {
      where.end_location = {
        contains: String(end_location),
        mode: 'insensitive',
      };
    }
    if (work_order_no) {
      where.work_order_no = {
        contains: String(work_order_no),
        mode: 'insensitive',
      };
    }
    if (receipt_no) {
      where.receipt_no = { contains: String(receipt_no), mode: 'insensitive' };
    }
    if (work_log_product_name) {
      where.work_log_product_name = {
        contains: String(work_log_product_name),
        mode: 'insensitive',
      };
    }
    this.applyColumnFilters(where, query, excludeColumnFilter);

    return where;
  }

  async findAll(query: WorkLogQuery) {
    const { page = 1, limit = 25 } = query;

    const where = this.buildWorkLogWhere(query);

    const allowedSort = [
      'id',
      'scheduled_date',
      'wl_whatsapp_reported_at',
      'status',
      'service_type',
      'machine_type',
      'equipment_number',
      'day_night',
      'created_at',
      'start_time',
      'end_time',
      'start_location',
      'end_location',
      'quantity',
      'unit',
      'ot_quantity',
      'ot_unit',
      'tonnage',
      'work_order_no',
      'receipt_no',
      'is_mid_shift',
      'is_confirmed',
      'is_paid',
      'goods_quantity',
      'work_log_product_name',
      'work_content',
      'work_log_product_unit',
      'remarks',
      'source',
    ];
    // Relation fields that need nested orderBy (dir is injected per sort entry)
    const relationSortMap: Record<string, (dir: 'asc' | 'desc') => any> = {
      publisher: (dir) => ({ publisher: { displayName: dir } }),
      company: (dir) => ({ company: { name: dir } }),
      client: (dir) => ({ client: { name: dir } }),
      quotation: (dir) => ({ quotation: { quotation_no: dir } }),
      contract: (dir) => ({ contract: { contract_no: dir } }),
      employee: (dir) => ({ employee: { name_zh: dir } }),
      client_contract_no: (dir) => ({ client_contract_no: dir }),
    };

    // ── Resolve sort list ─────────────────────────────────────
    // New format: sorts = [{ field, order }, ...] (array or JSON string)
    // Legacy format: sortBy + sortOrder single strings (backward compatible)
    type SortEntry = { field: string; order: string };
    let sortList: SortEntry[] = [];
    // Track whether the client explicitly sent a sorts key (even as empty array).
    // Empty array means "no explicit sort" — backend uses its own default.
    // Absent key means legacy client — fall back to sortBy/sortOrder.
    let sortsKeyProvided = false;
    const rawSorts = (query as any).sorts;
    if (rawSorts !== undefined && rawSorts !== null) {
      let parsed: unknown = rawSorts;
      if (typeof rawSorts === 'string') {
        try {
          parsed = JSON.parse(rawSorts);
        } catch {
          parsed = null;
        }
      }
      if (Array.isArray(parsed)) {
        sortsKeyProvided = true;
        sortList = (parsed as any[])
          .filter(
            (s: any): s is SortEntry =>
              s && typeof s.field === 'string' && typeof s.order === 'string',
          )
          .map((s: any) => ({ field: s.field, order: s.order }));
      }
    }
    if (!sortList.length && !sortsKeyProvided) {
      // sorts key was absent — fall back to legacy single-field format
      const legacyField =
        typeof query.sortBy === 'string' && query.sortBy
          ? query.sortBy
          : 'created_at';
      const legacyOrder =
        typeof query.sortOrder === 'string' && query.sortOrder
          ? query.sortOrder
          : 'DESC';
      sortList = [{ field: legacyField, order: legacyOrder }];
    }
    // If sortList is still empty (client sent sorts=[] explicitly),
    // orderByArray will also be empty and the fallback below applies.

    // Build Prisma orderBy array from the sort list
    const orderByArray: any[] = [];
    const seenFields = new Set<string>();
    for (const { field, order } of sortList) {
      if (seenFields.has(field)) continue;
      const dir: 'asc' | 'desc' =
        String(order).toUpperCase() === 'ASC' ? 'asc' : 'desc';
      if (relationSortMap[field]) {
        orderByArray.push(relationSortMap[field](dir));
        seenFields.add(field);
      } else if (allowedSort.includes(field)) {
        orderByArray.push({ [field]: dir });
        seenFields.add(field);
      }
      // Unknown fields are silently skipped
    }
    if (!orderByArray.length) {
      orderByArray.push({ scheduled_date: 'desc' });
    }
    // Stable tiebreaker
    if (!seenFields.has('id')) {
      orderByArray.push({ id: 'desc' });
    }
    const orderBy: OrderByClause = orderByArray;

    const pg = Number(page);
    const lm = Number(limit);

    const [data, total] = await Promise.all([
      this.prisma.workLog.findMany({
        where,
        include: {
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
        },
        orderBy,
        skip: (pg - 1) * lm,
        take: lm,
      }),
      this.prisma.workLog.count({ where }),
    ]);

    return {
      data,
      total,
      page: pg,
      limit: lm,
      totalPages: Math.ceil(total / lm),
    };
  }

  private readonly columnFilterFields = [
    'publisher',
    'status',
    'scheduled_date',
    'wl_whatsapp_reported_at',
    'service_type',
    'work_content',
    'company',
    'client',
    'quotation',
    'client_contract_no',
    'contract',
    'employee',
    'tonnage',
    'machine_type',
    'equipment_number',
    'day_night',
    'start_location',
    'start_time',
    'end_location',
    'end_time',
    'work_order_no',
    'receipt_no',
    'quantity',
    'unit',
    'ot_quantity',
    'ot_unit',
    'is_mid_shift',
    'goods_quantity',
    'work_log_product_name',
    'work_log_product_unit',
    'is_confirmed',
    'is_paid',
    'source',
    'remarks',
  ];

  private readonly relationFilterConfig: Record<
    string,
    { relation: string; field: string; foreignKey: string }
  > = {
    publisher: {
      relation: 'publisher',
      field: 'displayName',
      foreignKey: 'publisher_id',
    },
    company: { relation: 'company', field: 'name', foreignKey: 'company_id' },
    client: { relation: 'client', field: 'name', foreignKey: 'client_id' },
    quotation: {
      relation: 'quotation',
      field: 'quotation_no',
      foreignKey: 'quotation_id',
    },
    contract: {
      relation: 'contract',
      field: 'contract_no',
      foreignKey: 'contract_id',
    },
  };

  private readonly dateFilterFields = [
    'scheduled_date',
    'wl_whatsapp_reported_at',
  ];
  private readonly booleanFilterFields = [
    'is_mid_shift',
    'is_confirmed',
    'is_paid',
  ];
  private readonly numericFilterFields = [
    'quantity',
    'ot_quantity',
    'goods_quantity',
  ];

  private splitFilterValues(raw: unknown): string[] {
    if (raw === null || raw === undefined) return [];
    if (raw === '') return [''];

    if (Array.isArray(raw)) {
      return raw
        .map((value) => String(value).trim())
        .filter((value) => value.length > 0);
    }

    const rawString = String(raw);
    const trimmed = rawString.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed
            .filter(
              (value): value is string | number | boolean =>
                ['string', 'number', 'boolean'].includes(typeof value),
            )
            .map((value) => String(value).trim())
            .filter((value) => value.length > 0);
        }
      } catch {
        // Fall back to legacy comma-separated parsing below.
      }
    }

    return rawString
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
  }

  private isBlankFilterValue(value: string): boolean {
    return value === '(空白)' || value === '__BLANK__' || value === '';
  }

  private getNonBlankFilterValues(values: string[]): string[] {
    return values.filter((value) => !this.isBlankFilterValue(value));
  }

  private hasBlankFilterValue(values: string[]): boolean {
    return values.some((value) => this.isBlankFilterValue(value));
  }

  private appendAndCondition(where: WhereClause, condition: WhereClause): void {
    const existingConditions = Array.isArray(where.AND) ? where.AND : [];
    where.AND = [...existingConditions, condition];
  }

  private applyOrConditions(
    where: WhereClause,
    conditions: WhereClause[],
  ): void {
    if (conditions.length === 0) return;
    if (conditions.length === 1) {
      Object.assign(where, conditions[0]);
      return;
    }
    this.appendAndCondition(where, { OR: conditions });
  }

  private parseHongKongDateTime(value: string): Date | null {
    const match = value.match(
      /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/,
    );
    if (!match) return null;
    const [, year, month, day, hour = '00', minute = '00', second = '00'] =
      match;
    const utcMs = Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour) - 8,
      Number(minute),
      Number(second),
    );
    return new Date(utcMs);
  }

  private formatHongKongDate(
    value: Date | null | undefined,
    includeTime = false,
  ): string {
    return formatHongKongDate(value, includeTime);
  }

  private makeDateRange(value: string) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      // DATE type: no timezone conversion needed.
      const start = new Date(`${value}T00:00:00.000Z`);
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 1);
      return { gte: start, lt: end };
    }

    // TIMESTAMP type: keep Hong Kong timezone conversion.
    const start = this.parseHongKongDateTime(value);
    if (!start) return undefined;
    const end = new Date(start);
    end.setUTCMinutes(end.getUTCMinutes() + 1);
    return { gte: start, lt: end };
  }

  private applyColumnFilters(
    where: WhereClause,
    query: WorkLogQuery,
    excludeColumn?: string,
  ) {
    for (const field of this.columnFilterFields) {
      if (field === excludeColumn) continue;
      const vals = this.splitFilterValues(query[`filter_${field}`]);
      if (vals.length === 0) continue;

      const nonBlank = this.getNonBlankFilterValues(vals);
      const blankSelected = this.hasBlankFilterValue(vals);
      const relation = this.relationFilterConfig[field];

      if (field === 'employee') {
        const conditions: WhereClause[] = [];
        if (nonBlank.length > 0) {
          conditions.push({
            OR: [
              { employee: { name_zh: { in: nonBlank } } },
              {
                fleet_driver: {
                  OR: [
                    { name_zh: { in: nonBlank } },
                    { short_name: { in: nonBlank } },
                  ],
                },
              },
            ],
          });
        }
        if (blankSelected) {
          conditions.push({
            AND: [{ employee_id: null }, { work_log_fleet_driver_id: null }],
          });
        }
        this.applyOrConditions(where, conditions);
        continue;
      }

      if (relation) {
        const conditions: WhereClause[] = [];
        if (nonBlank.length > 0) {
          conditions.push({
            [relation.relation]: { [relation.field]: { in: nonBlank } },
          });
        }
        if (blankSelected) {
          conditions.push(
            { [relation.foreignKey]: null },
            { [relation.relation]: { [relation.field]: '' } },
          );
        }
        this.applyOrConditions(where, conditions);
        continue;
      }

      if (this.dateFilterFields.includes(field)) {
        const ranges = nonBlank
          .map((v) => this.makeDateRange(v))
          .filter((range): range is { gte: Date; lt: Date } => Boolean(range));
        const conditions: WhereClause[] = ranges.map((range) => ({
          [field]: range,
        }));
        if (blankSelected) conditions.push({ [field]: null });
        this.applyOrConditions(where, conditions);
        continue;
      }

      if (this.booleanFilterFields.includes(field)) {
        const bools = nonBlank
          .map((v) =>
            v === '是' || v === 'true'
              ? true
              : v === '否' || v === 'false'
                ? false
                : null,
          )
          .filter((v): v is boolean => v !== null);
        if (bools.length === 1) where[field] = bools[0];
        else if (bools.length > 1) where[field] = { in: bools };
        continue;
      }

      if (this.numericFilterFields.includes(field)) {
        const nums = nonBlank.map(Number).filter((num) => !Number.isNaN(num));
        const conditions: WhereClause[] = [];
        if (nums.length === 1) conditions.push({ [field]: nums[0] });
        else if (nums.length > 1) conditions.push({ [field]: { in: nums } });
        if (blankSelected) conditions.push({ [field]: null });
        this.applyOrConditions(where, conditions);
        continue;
      }

      const conditions: WhereClause[] = [];
      if (nonBlank.length === 1) conditions.push({ [field]: nonBlank[0] });
      else if (nonBlank.length > 1)
        conditions.push({ [field]: { in: nonBlank } });
      if (blankSelected) conditions.push({ [field]: null }, { [field]: '' });
      this.applyOrConditions(where, conditions);
    }
  }

  /**
   * 取得指定欄位的不重複值清單，供前端欄標題篩選器使用。
   * 會套用其他篩選條件，但排除目標欄位自身篩選。
   */
  async getFilterOptions(
    column: string,
    query: WorkLogQuery = {},
  ): Promise<string[]> {
    if (!this.columnFilterFields.includes(column)) return [];

    const where = this.buildWorkLogWhere(query, column);

    if (column === 'employee') {
      const rows = await this.prisma.workLog.findMany({
        where,
        select: {
          employee_id: true,
          work_log_fleet_driver_id: true,
          employee: { select: { name_zh: true } },
          fleet_driver: { select: { name_zh: true, short_name: true } },
        },
        take: 2000,
      });
      const names = new Set<string>();
      for (const row of rows as any[]) {
        if (row.employee?.name_zh) {
          names.add(row.employee.name_zh);
        } else if (row.fleet_driver?.name_zh || row.fleet_driver?.short_name) {
          names.add(row.fleet_driver.name_zh || row.fleet_driver.short_name);
        } else if (
          row.employee_id == null &&
          row.work_log_fleet_driver_id == null
        ) {
          names.add('(空白)');
        }
      }
      return Array.from(names)
        .sort((a, b) => a.localeCompare(b, 'zh-Hant'))
        .slice(0, 500);
    }

    const relation = this.relationFilterConfig[column];
    if (relation) {
      const rows = await this.prisma.workLog.findMany({
        where,
        select: {
          [relation.relation]: { select: { [relation.field]: true } },
        } as any,
        take: 2000,
      });
      return Array.from(
        new Set(
          rows.map(
            (row: any) => row[relation.relation]?.[relation.field] || '(空白)',
          ),
        ),
      )
        .sort((a, b) => a.localeCompare(b, 'zh-Hant'))
        .slice(0, 500);
    }

    if (this.dateFilterFields.includes(column)) {
      // Merge existing where condition for this column (e.g. date_from/date_to gte/lte)
      // with { not: null } instead of overwriting it
      const existingCondition = where[column] && typeof where[column] === 'object' ? where[column] : {};
      const mergedCondition = { ...existingCondition, not: null };
      const rows = await this.prisma.workLog.findMany({
        where: { ...where, [column]: mergedCondition },
        select: { [column]: true } as any,
        orderBy: { [column]: 'desc' } as any,
        take: 2000,
      });
      return Array.from(
        new Set(
          rows
            .map((row: any) => {
              const val = row[column];
              if (!val) return '';
              // For DATE type fields, use UTC date string directly (no timezone conversion).
              if (column === 'scheduled_date') {
                return val instanceof Date
                  ? val.toISOString().split('T')[0]
                  : String(val).split('T')[0];
              }
              return this.formatHongKongDate(
                val,
                column === 'wl_whatsapp_reported_at',
              );
            })
            .filter(Boolean),
        ),
      ).slice(0, 500);
    }

    if (this.booleanFilterFields.includes(column)) {
      const rows = await this.prisma.workLog.findMany({
        where,
        select: { [column]: true } as any,
        distinct: [column as any],
        take: 500,
      });
      return rows.map((row: any) => (row[column] ? '是' : '否'));
    }

    const rows = await this.prisma.workLog.findMany({
      where,
      select: { [column]: true } as any,
      distinct: [column as any],
      orderBy: { [column]: 'asc' } as any,
      take: 500,
    });
    return rows
      .map((row: any) =>
        row[column] == null || row[column] === ''
          ? '(空白)'
          : String(row[column]),
      )
      .sort((a: string, b: string) => a.localeCompare(b, 'zh-Hant'));
  }

  async findOne(id: number) {
    return this.prisma.workLog.findUnique({
      where: { id },
      include: {
        publisher: true,
        company_profile: true,
        company: true,
        client: true,
        quotation: true,
        contract: true,
        employee: true,
        project: true,
        fleet_driver: { include: { subcontractor: true } },
      },
    });
  }

  async create(dto: any, userId: number, ipAddress?: string) {
    const {
      publisher,
      company_profile,
      company,
      client,
      quotation,
      contract,
      employee,
      project,
      payroll_work_logs,
      matched_rate_card,
      rate_card,
      fleet_driver,
      ...data
    } = dto;
    await this.assertVehicleIsNotScrappedByWorkLogData(data);
    const saved = await this.prisma.workLog.create({
      data: {
        ...data,
        publisher_id: data.publisher_id ?? userId,
        equipment_source: this.resolveEquipmentSource(data.machine_type),
        scheduled_date: data.scheduled_date
          ? new Date(data.scheduled_date)
          : undefined,
      },
    });
    // Audit log
    if (userId) {
      try {
        await this.auditLogsService.log({
          userId,
          action: 'create',
          targetTable: 'work_logs',
          targetId: saved.id,
          changesAfter: saved,
          ipAddress,
        });
      } catch (e) {
        console.error('Audit log error:', e);
      }
    }
    // 自動匹配價格
    await this.matchAndSavePrice(saved);

    // 觸發日報核對
    if (saved.scheduled_date) {
      this.dailyReportVerificationService.verifyByDate(saved.scheduled_date).catch(() => {});
    }

    return this.findOne(saved.id);
  }

  async update(
    id: number,
    dto: any,
    userId?: number,
    ipAddress?: string,
    broadcast = true,
  ) {
    // Strip all relation objects and metadata to avoid Prisma errors
    const {
      id: _id,
      created_at,
      updated_at,
      publisher,
      company_profile,
      company,
      client,
      quotation,
      contract,
      employee,
      project,
      payroll_work_logs,
      matched_rate_card,
      rate_card,
      fleet_driver,
      ...rest
    } = dto;
    if (rest.machine_type !== undefined) {
      rest.equipment_source = this.resolveEquipmentSource(rest.machine_type);
    }
    await this.assertVehicleIsNotScrappedByWorkLogData(rest);
    if (rest.scheduled_date)
      rest.scheduled_date = new Date(rest.scheduled_date);

    // Remove any remaining nested objects that Prisma cannot handle
    for (const key of Object.keys(rest)) {
      if (
        rest[key] !== null &&
        typeof rest[key] === 'object' &&
        !(rest[key] instanceof Date) &&
        !Array.isArray(rest[key])
      ) {
        delete rest[key];
      }
    }

    // 如果編輯了地點欄位，自動消除 WhatsApp 新地點黃色標記
    if ('start_location' in rest || 'end_location' in rest) {
      rest.is_location_new = false;
    }

    // 當 client_id 被設定時，同步更新 unverified_client_name 為正式客戶名稱
    // 這樣交叉比對頁面和工作紀錄頁面顯示的客戶名稱會一致
    if ('client_id' in rest && rest.client_id) {
      const partner = await this.prisma.partner.findUnique({
        where: { id: Number(rest.client_id) },
        select: { name: true },
      });
      if (partner) {
        rest.unverified_client_name = partner.name;
      }
    }

    const existingWl = await this.prisma.workLog.findUnique({ where: { id } });
    await this.prisma.workLog.update({ where: { id }, data: rest });
    if (userId) {
      let afterWl: WorkLog | null = null;
      try {
        afterWl = await this.prisma.workLog.findUnique({ where: { id } });
        await this.auditLogsService.log({
          userId,
          action: 'update',
          targetTable: 'work_logs',
          targetId: id,
          changesBefore: existingWl,
          changesAfter: afterWl,
          ipAddress,
        });
      } catch (e) {
        console.error('Audit log error:', e);
      }
      await this.createKnowledgeCandidatesFromWorkLogCorrection(
        existingWl,
        afterWl,
        userId,
      );
    }
    // 自動匹配價格（如果關鍵欄位有變動）
    const priceRelatedFields = [
      'client_id',
      'company_profile_id',
      'company_id',
      'quotation_id',
      'contract_id',
      'client_contract_no',
      'machine_type',
      'tonnage',
      'day_night',
      'start_location',
      'end_location',
      'start_time',
      'end_time',
    ];
    const hasPriceChange = priceRelatedFields.some((f) => f in rest);
    if (hasPriceChange) {
      const updatedWl = await this.findOne(id);
      if (updatedWl) {
        await this.matchAndSavePrice(updatedWl as any);
      }
    }
    const updated = await this.findOne(id);
    if (broadcast && updated) {
      this.workLogsGateway.broadcastRowsUpdated([updated]);
    }

    // 觸發日報核對（工作記錄修改時重新核對相關日報）
    const verifyRelatedFields = ['scheduled_date', 'employee_id', 'equipment_number', 'work_log_machinery_id', 'work_log_vehicle_id'];
    const hasVerifyChange = verifyRelatedFields.some((f) => f in rest);
    if (hasVerifyChange) {
      const wlForVerify = await this.prisma.workLog.findUnique({ where: { id }, select: { scheduled_date: true } });
      if (wlForVerify?.scheduled_date) {
        this.dailyReportVerificationService.verifyByDate(wlForVerify.scheduled_date).catch(() => {});
      }
      // 如果日期變更，也要重新核對舊日期
      if (existingWl?.scheduled_date && rest.scheduled_date && existingWl.scheduled_date.toISOString() !== new Date(rest.scheduled_date).toISOString()) {
        this.dailyReportVerificationService.verifyByDate(existingWl.scheduled_date).catch(() => {});
      }
    }

    return updated;
  }

  private getChangedFields(before: any, after: any, fields?: string[]) {
    const keys =
      fields && fields.length > 0
        ? fields
        : Array.from(
            new Set([
              ...Object.keys(before || {}),
              ...Object.keys(after || {}),
            ]),
          );
    const changes: Record<string, { before: any; after: any }> = {};

    for (const key of keys) {
      const beforeValue = before?.[key] ?? null;
      const afterValue = after?.[key] ?? null;
      if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
        changes[key] = { before: beforeValue, after: afterValue };
      }
    }

    return changes;
  }

  private async logBulkWorkLogUpdate(params: {
    userId?: number;
    workLogId: number;
    before: any;
    after: any;
    operation: string;
    affectedIds: number[];
    fields?: string[];
  }) {
    if (!params.userId) return;

    const fieldChanges = this.getChangedFields(
      params.before,
      params.after,
      params.fields,
    );

    try {
      await this.auditLogsService.log({
        userId: params.userId,
        action: 'update',
        targetTable: 'work_logs',
        targetId: params.workLogId,
        changesBefore: {
          fields: Object.fromEntries(
            Object.entries(fieldChanges).map(([field, change]) => [
              field,
              (change as { before: any; after: any }).before,
            ]),
          ),
        },
        changesAfter: {
          fields: Object.fromEntries(
            Object.entries(fieldChanges).map(([field, change]) => [
              field,
              (change as { before: any; after: any }).after,
            ]),
          ),
          changes: fieldChanges,
          metadata: {
            isBulkOperation: true,
            operation: params.operation,
            targetTable: 'work_logs',
            affectedCount: params.affectedIds.length,
            affectedIds: params.affectedIds,
            fields: Object.keys(fieldChanges),
          },
        },
      });
    } catch (e) {
      console.error('Audit log error:', e);
    }
  }

  private async logBulkWorkLogConfirmation(params: {
    userId?: number;
    operation: 'bulk_confirm' | 'bulk_unconfirm';
    affectedIds: number[];
    beforeLogs: any[];
    afterLogs: any[];
  }) {
    if (!params.userId || params.affectedIds.length === 0) return;

    try {
      await this.auditLogsService.log({
        userId: params.userId,
        action: 'update',
        targetTable: 'work_logs',
        targetId: params.affectedIds[0],
        changesBefore: {
          workLogIds: params.affectedIds,
          records: params.beforeLogs.map((log) => ({
            id: log.id,
            is_confirmed: log.is_confirmed,
          })),
        },
        changesAfter: {
          workLogIds: params.affectedIds,
          records: params.afterLogs.map((log) => ({
            id: log.id,
            is_confirmed: log.is_confirmed,
          })),
          metadata: {
            isBulkOperation: true,
            operation: params.operation,
            targetTable: 'work_logs',
            affectedCount: params.affectedIds.length,
            affectedIds: params.affectedIds,
            fields: ['is_confirmed'],
          },
        },
      });
    } catch (e) {
      console.error('Audit log error:', e);
    }
  }

  async remove(id: number, userId?: number, ipAddress?: string) {
    const existing = await this.prisma.workLog.findUnique({ where: { id } });
    if (userId && existing) {
      try {
        await this.auditLogsService.log({
          userId,
          action: 'delete',
          targetTable: 'work_logs',
          targetId: id,
          changesBefore: existing,
          ipAddress,
        });
      } catch (e) {
        console.error('Audit log error:', e);
      }
    }
    // 先解除 PayrollWorkLog 的關聯
    await this.prisma.payrollWorkLog.updateMany({
      where: { work_log_id: id },
      data: { work_log_id: null },
    });
    await this.prisma.workLog.update({
      where: { id },
      data: { deleted_at: new Date(), deleted_by: userId ?? null },
    });
    return { success: true };
  }

  async bulkDelete(ids: number[]) {
    // Guard: ids must be a non-empty array
    if (!Array.isArray(ids) || ids.length === 0) {
      return { success: true, deleted: 0 };
    }

    // Coerce every element to a proper integer (HTTP JSON may deliver strings
    // or floating-point numbers depending on the client).
    const safeIds = ids
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0);
    if (safeIds.length === 0) {
      return { success: true, deleted: 0 };
    }

    // Step 1: Detach PayrollWorkLog rows that reference these work-logs so the
    //         FK constraint (ON DELETE SET NULL) is handled explicitly before
    //         the deleteMany, avoiding any race-condition or deferred-FK issue.
    await this.prisma.payrollWorkLog.updateMany({
      where: { work_log_id: { in: safeIds } },
      data: { work_log_id: null },
    });

    // Step 2: Soft-delete the work-log rows.
    const result = await this.prisma.workLog.updateMany({
      where: { id: { in: safeIds } },
      data: { deleted_at: new Date() },
    });

    return { success: true, deleted: result.count };
  }

  async bulkUpdate(ids: number[], field: string, value: any, userId?: number) {
    const safeIds = Array.isArray(ids)
      ? ids
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id) && id > 0)
      : [];
    if (safeIds.length === 0) {
      return { success: true, updated: 0 };
    }

    // Whitelist of fields that can be batch-updated
    const ALLOWED_FIELDS = [
      'status',
      'scheduled_date',
      'service_type',
      'company_profile_id',
      'company_id',
      'client_id',
      'quotation_id',
      'contract_id',
      'client_contract_no',
      'employee_id',
      'work_log_fleet_driver_id',
      'machine_type',
      'equipment_number',
      'tonnage',
      'day_night',
      'start_location',
      'start_time',
      'end_location',
      'end_time',
      'quantity',
      'unit',
      'ot_quantity',
      'ot_unit',
      'is_mid_shift',
      'goods_quantity',
      'receipt_no',
      'work_order_no',
      'is_confirmed',
      'is_paid',
      'remarks',
      'work_log_product_name',
      'work_content',
      'work_log_product_unit',
    ];
    if (!ALLOWED_FIELDS.includes(field)) {
      throw new Error(`Field "${field}" is not allowed for batch update`);
    }
    let processedValue = value;
    // Type coercions
    if (field === 'scheduled_date' && processedValue) {
      processedValue = new Date(processedValue);
    }
    if (
      [
        'company_profile_id',
        'company_id',
        'client_id',
        'quotation_id',
        'contract_id',
        'employee_id',
        'work_log_fleet_driver_id',
      ].includes(field)
    ) {
      processedValue =
        processedValue !== null && processedValue !== ''
          ? Number(processedValue)
          : null;
    }
    if (['quantity', 'ot_quantity', 'goods_quantity'].includes(field)) {
      processedValue =
        processedValue !== null && processedValue !== ''
          ? Number(processedValue)
          : null;
    }
    if (['is_mid_shift', 'is_confirmed', 'is_paid'].includes(field)) {
      processedValue = Boolean(processedValue);
    }

    const beforeLogs = await this.prisma.workLog.findMany({
      where: { id: { in: safeIds } },
      orderBy: { id: 'asc' },
    });
    const affectedIds = beforeLogs.map((log) => log.id);
    const auditFields =
      field === 'machine_type' ? ['machine_type', 'equipment_source'] : [field];

    if (field === 'machine_type') {
      // Also update equipment_source
      const equipmentSource = this.resolveEquipmentSource(processedValue);
      await this.prisma.workLog.updateMany({
        where: { id: { in: affectedIds } },
        data: {
          machine_type: processedValue,
          equipment_source: equipmentSource,
        },
      });
      // Re-match prices for affected records
      const priceRelatedFields = ['machine_type'];
      if (priceRelatedFields.includes(field)) {
        const updatedLogs = await this.prisma.workLog.findMany({
          where: { id: { in: affectedIds } },
          include: { company: true, client: true },
        });
        await Promise.all(
          updatedLogs.map((log) => this.matchAndSavePrice(log)),
        );
      }
    } else {
      await this.prisma.workLog.updateMany({
        where: { id: { in: affectedIds } },
        data: { [field]: processedValue },
      });
      // Re-match prices if price-related field changed
      const priceRelatedFields = [
        'client_id',
        'company_profile_id',
        'company_id',
        'quotation_id',
        'contract_id',
        'client_contract_no',
        'tonnage',
        'day_night',
        'start_location',
        'end_location',
        'start_time',
        'end_time',
      ];
      if (priceRelatedFields.includes(field)) {
        const updatedLogs = await this.prisma.workLog.findMany({
          where: { id: { in: affectedIds } },
          include: { company: true, client: true },
        });
        await Promise.all(
          updatedLogs.map((log) => this.matchAndSavePrice(log)),
        );
      }
    }

    if (userId && affectedIds.length > 0) {
      const afterLogs = await this.prisma.workLog.findMany({
        where: { id: { in: affectedIds } },
        orderBy: { id: 'asc' },
      });
      const afterById = new Map(afterLogs.map((log) => [log.id, log]));
      await Promise.all(
        beforeLogs.map((before) => {
          const after = afterById.get(before.id);
          if (!after) return Promise.resolve();
          return this.logBulkWorkLogUpdate({
            userId,
            workLogId: before.id,
            before,
            after,
            operation: 'bulk_update',
            affectedIds,
            fields: auditFields,
          });
        }),
      );
      await Promise.all(
        beforeLogs.map((before) => {
          const after = afterById.get(before.id);
          if (!after) return Promise.resolve();
          return this.createKnowledgeCandidatesFromWorkLogCorrection(
            before,
            after,
            userId,
          );
        }),
      );
    }

    if (affectedIds.length > 0) {
      const updatedRows = await Promise.all(
        affectedIds.map((workLogId) => this.findOne(workLogId)),
      );
      this.workLogsGateway.broadcastRowsUpdated(updatedRows.filter(Boolean));
    }

    return { success: true, updated: affectedIds.length };
  }
  async bulkConfirm(ids: number[], userId?: number) {
    const safeIds = Array.isArray(ids)
      ? ids
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id) && id > 0)
      : [];
    if (safeIds.length === 0) {
      return { success: true, confirmed: 0 };
    }

    const beforeLogs = await this.prisma.workLog.findMany({
      where: { id: { in: safeIds } },
      orderBy: { id: 'asc' },
    });
    const affectedIds = beforeLogs.map((log) => log.id);
    await this.prisma.workLog.updateMany({
      where: { id: { in: affectedIds } },
      data: { is_confirmed: true },
    });
    const afterLogs =
      affectedIds.length > 0
        ? await this.prisma.workLog.findMany({
            where: { id: { in: affectedIds } },
            orderBy: { id: 'asc' },
          })
        : [];
    if (userId && affectedIds.length > 0) {
      await this.logBulkWorkLogConfirmation({
        userId,
        operation: 'bulk_confirm',
        affectedIds,
        beforeLogs,
        afterLogs,
      });
    }
    if (afterLogs.length > 0) {
      const updatedRows = await Promise.all(
        afterLogs.map((workLog) => this.findOne(workLog.id)),
      );
      this.workLogsGateway.broadcastRowsUpdated(updatedRows.filter(Boolean));
    }
    return { success: true, confirmed: affectedIds.length };
  }
  async bulkUnconfirm(ids: number[], userId?: number) {
    const safeIds = Array.isArray(ids)
      ? ids
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id) && id > 0)
      : [];
    if (safeIds.length === 0) {
      return { success: true, unconfirmed: 0 };
    }

    const beforeLogs = await this.prisma.workLog.findMany({
      where: { id: { in: safeIds } },
      orderBy: { id: 'asc' },
    });
    const affectedIds = beforeLogs.map((log) => log.id);
    await this.prisma.workLog.updateMany({
      where: { id: { in: affectedIds } },
      data: { is_confirmed: false },
    });
    const afterLogs =
      affectedIds.length > 0
        ? await this.prisma.workLog.findMany({
            where: { id: { in: affectedIds } },
            orderBy: { id: 'asc' },
          })
        : [];
    if (userId && affectedIds.length > 0) {
      await this.logBulkWorkLogConfirmation({
        userId,
        operation: 'bulk_unconfirm',
        affectedIds,
        beforeLogs,
        afterLogs,
      });
    }
    if (afterLogs.length > 0) {
      const updatedRows = await Promise.all(
        afterLogs.map((workLog) => this.findOne(workLog.id)),
      );
      this.workLogsGateway.broadcastRowsUpdated(updatedRows.filter(Boolean));
    }
    return { success: true, unconfirmed: affectedIds.length };
  }
  async duplicate(id: number, userId: number) {
    const original = await this.prisma.workLog.findUnique({ where: { id } });
    if (!original) throw new Error('WorkLog not found');
    const copy = await this.prisma.workLog.create({
      data: {
        status: 'editing',
        service_type: original.service_type,
        scheduled_date: original.scheduled_date,
        company_profile_id: original.company_profile_id,
        company_id: original.company_id,
        client_id: original.client_id,
        quotation_id: original.quotation_id,
        contract_id: original.contract_id,
        client_contract_no: original.client_contract_no,
        employee_id: original.employee_id,
        work_log_fleet_driver_id: original.work_log_fleet_driver_id,
        machine_type: original.machine_type,
        equipment_number: original.equipment_number,
        equipment_source: original.equipment_source,
        tonnage: original.tonnage,
        day_night: original.day_night,
        start_location: original.start_location,
        start_time: original.start_time,
        end_location: original.end_location,
        end_time: original.end_time,
        quantity: original.quantity,
        unit: original.unit,
        ot_quantity: original.ot_quantity,
        ot_unit: original.ot_unit,
        goods_quantity: original.goods_quantity,
        work_log_product_name: original.work_log_product_name,
        work_log_product_unit: original.work_log_product_unit,
        remarks: original.remarks,
        publisher_id: userId,
        is_confirmed: false,
        is_paid: false,
      },
    });
    await this.matchAndSavePrice(copy);
    return this.findOne(copy.id);
  }

  // ── 地點自動完成 ─────────────────────────────────────────

  async getLocationSuggestions(type: 'start' | 'end', q: string) {
    const pattern = `%${q}%`;
    const results: { location: string }[] =
      type === 'start'
        ? await this.prisma.$queryRaw`
            SELECT DISTINCT "start_location" AS location
            FROM work_logs
            WHERE "start_location" ILIKE ${pattern}
              AND "start_location" IS NOT NULL
              AND "start_location" != ''
            ORDER BY location ASC
            LIMIT 20
          `
        : await this.prisma.$queryRaw`
            SELECT DISTINCT "end_location" AS location
            FROM work_logs
            WHERE "end_location" ILIKE ${pattern}
              AND "end_location" IS NOT NULL
              AND "end_location" != ''
            ORDER BY location ASC
            LIMIT 20
          `;
    return results.map((r) => r.location).filter(Boolean);
  }

  // ── 機號聯動查詢 ─────────────────────────────────────────

  async getEquipmentOptions(machineType: string, tonnage?: string) {
    const source = this.resolveEquipmentSource(machineType);
    if (!source) return [];

    if (source === 'vehicle') {
      const where: any = { status: 'active' };
      if (tonnage) {
        const tonnageNum = parseFloat(tonnage.replace('噸', ''));
        if (!isNaN(tonnageNum)) where.tonnage = tonnageNum;
      }
      const [vehicles, subconDrivers] = await Promise.all([
        this.prisma.vehicle.findMany({
          where,
          select: {
            id: true,
            plate_number: true,
            machine_type: true,
            tonnage: true,
          },
          orderBy: { plate_number: 'asc' },
        }),
        this.prisma.subcontractorFleetDriver.findMany({
          where: { status: 'active', plate_no: { not: null } },
          select: {
            id: true,
            plate_no: true,
            machine_type: true,
            subcontractor: { select: { name: true } },
          },
          orderBy: { plate_no: 'asc' },
        }),
      ]);

      const vehicleOptions = vehicles.map((v) => ({
        id: v.id,
        value: v.plate_number,
        label: v.plate_number,
        tonnage: v.tonnage != null ? `${v.tonnage}噸` : null,
        type: v.machine_type,
        source: 'vehicle',
      }));

      const subconOptions = subconDrivers.map((d) => ({
        id: d.id,
        value: d.plate_no!,
        label: `${d.plate_no} (${d.subcontractor.name})`,
        type: d.machine_type,
        source: 'subcon_fleet',
      }));

      return [...vehicleOptions, ...subconOptions];
    }

    if (source === 'machinery') {
      const where: any = { status: 'active' };
      if (tonnage) {
        const tonnageNum = parseFloat(tonnage.replace('噸', ''));
        if (!isNaN(tonnageNum)) where.tonnage = tonnageNum;
      }
      const machines = await this.prisma.machinery.findMany({
        where,
        select: {
          id: true,
          machine_code: true,
          machine_type: true,
          tonnage: true,
        },
        orderBy: { machine_code: 'asc' },
      });
      return machines.map((m) => ({
        id: m.id,
        value: m.machine_code,
        label: m.machine_code,
        tonnage: m.tonnage != null ? `${m.tonnage}噸` : null,
        type: m.machine_type,
        source: 'machinery',
      }));
    }

    return [];
  }

  // ── 自動價格匹配 ─────────────────────────────────────────
  private async matchAndSavePrice(workLog: any) {
    if (!workLog) return;

    if (!workLog.client_id) {
      await this.prisma.workLog.update({
        where: { id: workLog.id },
        data: {
          price_match_status: 'pending',
          price_match_note: '缺少客戶資訊，無法匹配',
          matched_rate_card_id: null,
          matched_rate: null,
          matched_unit: null,
          matched_ot_rate: null,
          client_price_match_status: 'pending',
          client_price_match_note: '缺少客戶資訊，無法匹配',
          matched_client_rate_card_id: null,
          matched_client_rate: null,
          matched_client_unit: null,
          matched_client_ot_rate: null,
        },
      });
      return;
    }

    const updateData: Record<string, unknown> = {};

    // 根據業務邏輯：工作記錄配對費率查 FleetRateCard（租賃價目表），用於計算員工薪酬/機械成本
    // RateCard（客戶價目表）用於開發票，SubconRateCard（供應商價目表）用於付款給供應商
    const { card, unmatchedReason } =
      await this.pricingService.matchFleetRateCardFromDb(
        workLog.client_id,
        workLog.company_id || workLog.company_profile_id,
        workLog.client_contract_no || null,
        workLog.service_type,
        workLog.day_night,
        workLog.tonnage,
        workLog.machine_type,
        workLog.start_location,
        workLog.end_location,
      );

    if (card) {
      const { rate, unit } = this.pricingService.resolveRate(
        card,
        workLog.day_night,
      );
      updateData.price_match_status = 'matched';
      updateData.price_match_note = `匹配到：${card.name || card.client_contract_no || `FleetRC#${card.id}`}`;
      updateData.matched_rate_card_id = card.id;
      updateData.matched_rate = rate;
      updateData.matched_unit = unit;
      updateData.matched_ot_rate = card.ot_rate ?? null;
    } else {
      updateData.price_match_status = 'unmatched';
      updateData.price_match_note =
        unmatchedReason || '找不到對應的租賃價目表，請人工處理';
      updateData.matched_rate_card_id = null;
      updateData.matched_rate = null;
      updateData.matched_unit = null;
      updateData.matched_ot_rate = null;
    }

    // 客戶價目配對（用於開發票）
    const { card: clientCard, unmatchedReason: clientUnmatchedReason } =
      await this.pricingService.matchRateCardFromDb(
        workLog.client_id,
        workLog.company_id || workLog.company_profile_id,
        workLog.quotation_id || null,
        workLog.service_type,
        workLog.machine_type,
        workLog.tonnage,
        workLog.start_location,
        workLog.end_location,
      );

    if (clientCard) {
      const { rate, unit } = this.pricingService.resolveRate(
        clientCard,
        workLog.day_night,
      );
      updateData.client_price_match_status = 'matched';
      updateData.client_price_match_note = `匹配到：${clientCard.name || clientCard.client_contract_no || `RateCard#${clientCard.id}`}`;
      updateData.matched_client_rate_card_id = clientCard.id;
      updateData.matched_client_rate = rate;
      updateData.matched_client_unit = unit;
      updateData.matched_client_ot_rate = clientCard.ot_rate ?? null;
    } else {
      updateData.client_price_match_status = 'unmatched';
      updateData.client_price_match_note =
        clientUnmatchedReason || '找不到對應的客戶價目表，請人工處理';
      updateData.matched_client_rate_card_id = null;
      updateData.matched_client_rate = null;
      updateData.matched_client_unit = null;
      updateData.matched_client_ot_rate = null;
    }

    await this.prisma.workLog.update({
      where: { id: workLog.id },
      data: updateData as never,
    });
  }

  // tryMatchRateCard 和 resolveRate 已移至 PricingService

  // ── 批量儲存 (Airtable 風格) ───────────────────────────

  async bulkSave(changes: Array<{ id: number; data: any }>, userId?: number) {
    const safeChanges = Array.isArray(changes) ? changes : [];
    const affectedIds = safeChanges
      .map(({ id }) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0);
    const beforeLogs = userId
      ? await this.prisma.workLog.findMany({
          where: { id: { in: affectedIds } },
          orderBy: { id: 'asc' },
        })
      : [];
    const beforeById = new Map(beforeLogs.map((log) => [log.id, log]));
    const results: any[] = [];

    for (const { id, data } of safeChanges) {
      try {
        const numericId = Number(id);
        const updated = await this.update(
          numericId,
          data,
          undefined,
          undefined,
          false,
        );
        results.push({ id: numericId, success: true, data: updated });

        const before = beforeById.get(numericId);
        if (userId && before) {
          const after = await this.prisma.workLog.findUnique({
            where: { id: numericId },
          });
          if (after) {
            await this.logBulkWorkLogUpdate({
              userId,
              workLogId: numericId,
              before,
              after,
              operation: 'bulk_save',
              affectedIds,
              fields: Object.keys(data || {}),
            });
          }
        }
      } catch (e: any) {
        results.push({ id, success: false, error: e.message });
      }
    }
    const updatedRows = results
      .filter((result) => result.success && result.data)
      .map((result) => result.data);
    if (updatedRows.length > 0) {
      this.workLogsGateway.broadcastRowsUpdated(updatedRows);
    }

    return {
      results,
      saved: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
    };
  }
  // ── 確認地點（消除 WhatsApp 打卡黃色 Highlight）───────────

  async confirmLocation(id: number) {
    await this.prisma.workLog.update({
      where: { id },
      data: { is_location_new: false },
    });
    return { success: true };
  }

  // ── 缺單價組合 ─────────────────────────────────────────────

  async getUnmatchedCombinations(
    query: UnmatchedCombinationsQueryDto,
  ): Promise<UnmatchedCombinationsResult> {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 50;

    // Build WHERE conditions for filtering
    const conditions: string[] = [
      `wl.deleted_at IS NULL`,
      `(wl.client_price_match_status = 'unmatched' OR wl.client_price_match_status IS NULL)`,
    ];
    const params: (string | number)[] = [];
    let paramIdx = 1;

    const addTextFilter = (raw: string | undefined, sqlExpr: string) => {
      const values = this.splitFilterValues(raw);
      if (values.length === 0) return;

      const nonBlank = this.getNonBlankFilterValues(values);
      const blankSelected = this.hasBlankFilterValue(values);
      const textConditions: string[] = [];

      if (nonBlank.length === 1) {
        textConditions.push(`${sqlExpr} = $${paramIdx++}`);
        params.push(nonBlank[0]);
      } else if (nonBlank.length > 1) {
        const placeholders = nonBlank.map((value) => {
          params.push(value);
          return `$${paramIdx++}`;
        });
        textConditions.push(`${sqlExpr} IN (${placeholders.join(', ')})`);
      }

      if (blankSelected) {
        textConditions.push(`(${sqlExpr} IS NULL OR ${sqlExpr} = '')`);
      }

      if (textConditions.length === 1) {
        conditions.push(textConditions[0]);
      } else if (textConditions.length > 1) {
        conditions.push(`(${textConditions.join(' OR ')})`);
      }
    };

    if (query.company_id) {
      conditions.push(
        `COALESCE(wl.company_id, wl.company_profile_id) = $${paramIdx++}`,
      );
      params.push(Number(query.company_id));
    }
    addTextFilter(query.company_name, 'COALESCE(co.name, cp.name)');
    if (query.client_id) {
      conditions.push(`wl.client_id = $${paramIdx++}`);
      params.push(Number(query.client_id));
    }
    addTextFilter(query.client_name, 'cl.name');
    addTextFilter(query.client_contract_no, 'wl.client_contract_no');
    addTextFilter(query.service_type, 'wl.service_type');
    if (query.quotation_id) {
      conditions.push(`wl.quotation_id = $${paramIdx++}`);
      params.push(Number(query.quotation_id));
    }
    addTextFilter(query.quotation_no, 'q.quotation_no');
    addTextFilter(query.day_night, 'wl.day_night');
    addTextFilter(query.tonnage, 'wl.tonnage');
    addTextFilter(query.machine_type, 'wl.machine_type');
    addTextFilter(query.start_location, 'wl.start_location');
    addTextFilter(query.end_location, 'wl.end_location');

    const whereClause = conditions.join(' AND ');

    // Allowed sort columns
    const allowedSorts: Record<string, string> = {
      company_name: 'company_name',
      client_name: 'client_name',
      client_contract_no: 'client_contract_no',
      service_type: 'service_type',
      quotation_no: 'quotation_no',
      day_night: 'day_night',
      tonnage: 'tonnage',
      machine_type: 'machine_type',
      start_location: 'start_location',
      end_location: 'end_location',
      count: 'count',
    };
    const sortCol = allowedSorts[query.sort_by || ''] || 'count';
    const sortDir = query.sort_order?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const groupByCols = `
      COALESCE(wl.company_id, wl.company_profile_id),
      wl.client_id,
      wl.client_contract_no,
      wl.service_type,
      wl.quotation_id,
      wl.day_night,
      wl.tonnage,
      wl.machine_type,
      wl.start_location,
      wl.end_location`;

    const selectCols = `
      COALESCE(wl.company_id, wl.company_profile_id) AS company_id,
      MAX(COALESCE(co.name, cp.name)) AS company_name,
      wl.client_id,
      MAX(cl.name) AS client_name,
      wl.client_contract_no,
      wl.service_type,
      wl.quotation_id,
      MAX(q.quotation_no) AS quotation_no,
      wl.day_night,
      wl.tonnage,
      wl.machine_type,
      wl.start_location,
      wl.end_location,
      COUNT(*)::int AS count`;

    const fromClause = `
      FROM work_logs wl
      LEFT JOIN companies co ON co.id = wl.company_id
      LEFT JOIN companies cp ON cp.id = wl.company_profile_id
      LEFT JOIN partners cl ON cl.id = wl.client_id
      LEFT JOIN quotations q ON q.id = wl.quotation_id`;

    // Count total distinct combinations
    const countSql = `SELECT COUNT(*) AS total FROM (SELECT 1 ${fromClause} WHERE ${whereClause} GROUP BY ${groupByCols}) sub`;
    const countResult = await this.prisma.$queryRawUnsafe<{ total: number }[]>(
      countSql,
      ...params,
    );
    const total = Number(countResult[0]?.total || 0);

    // Count total unmatched work_logs
    const unmatchedCountSql = `SELECT COUNT(*)::int AS cnt FROM work_logs wl WHERE wl.deleted_at IS NULL AND (wl.client_price_match_status = 'unmatched' OR wl.client_price_match_status IS NULL)`;
    const unmatchedResult =
      await this.prisma.$queryRawUnsafe<{ cnt: number }[]>(unmatchedCountSql);
    const totalUnmatched = Number(unmatchedResult[0]?.cnt || 0);

    // Main query with pagination
    const offset = (page - 1) * limit;
    const dataSql = `SELECT ${selectCols} ${fromClause} WHERE ${whereClause} GROUP BY ${groupByCols} ORDER BY ${sortCol} ${sortDir} NULLS LAST LIMIT ${limit} OFFSET ${offset}`;
    const rawRows = await this.prisma.$queryRawUnsafe<
      Record<string, unknown>[]
    >(dataSql, ...params);

    const data: UnmatchedCombinationRow[] = rawRows.map((r) => ({
      company_id: r.company_id != null ? Number(r.company_id) : null,
      company_name: (r.company_name as string) || null,
      client_id: r.client_id != null ? Number(r.client_id) : null,
      client_name: (r.client_name as string) || null,
      client_contract_no: (r.client_contract_no as string) || null,
      service_type: (r.service_type as string) || null,
      quotation_id: r.quotation_id != null ? Number(r.quotation_id) : null,
      quotation_no: (r.quotation_no as string) || null,
      day_night: (r.day_night as string) || null,
      tonnage: (r.tonnage as string) || null,
      machine_type: (r.machine_type as string) || null,
      start_location: (r.start_location as string) || null,
      end_location: (r.end_location as string) || null,
      count: Number(r.count),
    }));

    return {
      data,
      total,
      totalUnmatched,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async addRateAndRematch(dto: AddRateAndRematchDto): Promise<{
    rateCard: { id: number };
    rematchedCount: number;
  }> {
    const companyId = Number(dto.company_id);
    const clientId = Number(dto.client_id);

    if (!Number.isInteger(companyId) || companyId <= 0) {
      throw new BadRequestException('新增客戶價目必須提供有效的公司資訊');
    }
    if (!Number.isInteger(clientId) || clientId <= 0) {
      throw new BadRequestException('新增客戶價目必須提供有效的客戶資訊');
    }

    // 1. Create rate_card（客戶價目表，用於開發票）
    const rateCardData: Record<string, unknown> = {
      client_id: clientId,
      company_id: companyId,
      client_contract_no: dto.client_contract_no || undefined,
      service_type: dto.service_type || undefined,
      source_quotation_id: dto.quotation_id || undefined,
      day_night: dto.day_night || undefined,
      tonnage: dto.tonnage || undefined,
      machine_type: dto.machine_type || undefined,
      origin: dto.start_location || undefined,
      destination: dto.end_location || undefined,
      rate: dto.rate,
      ot_rate: dto.ot_rate ?? 0,
      mid_shift_rate: dto.mid_shift_rate ?? 0,
      unit: dto.unit || '日',
      effective_date: dto.effective_date ? new Date(dto.effective_date) : null,
      rate_card_type: 'rental',
      status: 'active',
      deleted_at: null,
    };

    // Remove undefined keys
    const cleanData: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rateCardData)) {
      if (v !== undefined) cleanData[k] = v;
    }

    const saved = await this.prisma.rateCard.create({
      data: cleanData as never,
    });

    // 2. Find affected client-unmatched work_logs with matching conditions
    const where: Record<string, unknown> = {
      deleted_at: null,
      AND: [
        {
          OR: [
            { client_price_match_status: 'unmatched' },
            { client_price_match_status: null },
          ],
        },
        { OR: [{ company_id: companyId }, { company_profile_id: companyId }] },
      ],
      client_id: clientId,
    };
    if (dto.client_contract_no)
      where.client_contract_no = dto.client_contract_no;
    if (dto.service_type) where.service_type = dto.service_type;
    if (dto.quotation_id) where.quotation_id = dto.quotation_id;
    if (dto.day_night) where.day_night = dto.day_night;
    if (dto.tonnage) where.tonnage = dto.tonnage;
    if (dto.machine_type) where.machine_type = dto.machine_type;
    if (dto.start_location) where.start_location = dto.start_location;
    if (dto.end_location) where.end_location = dto.end_location;

    const affectedLogs = await this.prisma.workLog.findMany({
      where: where as never,
      include: { company: true, client: true },
    });

    // 3. Re-match each affected work_log
    let rematchedCount = 0;
    for (const log of affectedLogs) {
      await this.matchAndSavePrice(log);
      rematchedCount++;
    }

    return { rateCard: { id: saved.id }, rematchedCount };
  }

  // ── Pivot Table 整理分析 ─────────────────────────────────────

  async getPivot(query: WorkLogPivotQueryDto): Promise<WorkLogPivotResult> {
    const rowFields = this.parsePivotDimensions(query.row_fields, ['employee']);
    const colFields = this.parsePivotDimensions(query.col_fields, [
      'scheduled_date',
    ]);
    const valueTypes = this.parsePivotValueTypes(query);
    const isMultiValue = valueTypes.length > 1;
    const where = this.buildPivotWhere(query);

    const logs = (await this.prisma.workLog.findMany({
      where,
      select: {
        id: true,
        status: true,
        scheduled_date: true,
        client_contract_no: true,
        service_type: true,
        company_id: true,
        client_id: true,
        employee_id: true,
        work_log_fleet_driver_id: true,
        machine_type: true,
        equipment_number: true,
        tonnage: true,
        day_night: true,
        start_location: true,
        end_location: true,
        quantity: true,
        unit: true,
        goods_quantity: true,
        ot_quantity: true,
        ot_unit: true,
        is_mid_shift: true,
        is_confirmed: true,
        price_match_status: true,
        matched_rate_card_id: true,
        company: { select: { name: true, internal_prefix: true } },
        company_profile: {
          select: { chinese_name: true, english_name: true, code: true },
        },
        client: { select: { name: true } },
        quotation: { select: { quotation_no: true } },
        contract: { select: { contract_no: true } },
        employee: { select: { name_zh: true } },
        fleet_driver: { select: { name_zh: true, short_name: true } },
      },
      orderBy: [{ scheduled_date: 'asc' }, { id: 'asc' }],
    })) as unknown as PivotWorkLogRecord[];

    const rowMap = new Map<string, PivotAxisItem>();
    const colMap = new Map<string, PivotAxisItem>();
    const cellAccumulators = new Map<string, PivotAccumulator>();
    const rowAccumulators = new Map<string, PivotAccumulator>();
    const colAccumulators = new Map<string, PivotAccumulator>();
    const grandAccumulator = this.createPivotAccumulator();
    const grandAccumulators = new Map<string, PivotAccumulator>();

    const allRow = this.makePivotAxisParts([], []);
    const allCol = this.makePivotAxisParts([], []);

    for (const log of logs) {
      const rowParts =
        rowFields.length > 0 ? this.getPivotAxisParts(log, rowFields) : allRow;
      const colParts =
        colFields.length > 0 ? this.getPivotAxisParts(log, colFields) : allCol;
      rowMap.set(rowParts.key, {
        key: rowParts.key,
        values: rowParts.values,
        labels: rowParts.labels,
      });
      colMap.set(colParts.key, {
        key: colParts.key,
        values: colParts.values,
        labels: colParts.labels,
      });

      for (const valueType of valueTypes) {
        const metric = this.getPivotMetricForLog(log, valueType);
        const metricSuffix = isMultiValue ? `|${valueType}` : '';
        this.addPivotMetric(
          cellAccumulators,
          `${rowParts.key}|${colParts.key}${metricSuffix}`,
          metric.value,
          metric.unit,
        );
        this.addPivotMetric(
          rowAccumulators,
          `${rowParts.key}${metricSuffix}`,
          metric.value,
          metric.unit,
        );
        this.addPivotMetric(
          colAccumulators,
          `${colParts.key}${metricSuffix}`,
          metric.value,
          metric.unit,
        );
        if (isMultiValue) {
          this.addPivotMetric(
            grandAccumulators,
            valueType,
            metric.value,
            metric.unit,
          );
        } else {
          this.addToPivotAccumulator(grandAccumulator, metric.value, metric.unit);
        }
      }
    }

    if (logs.length === 0) {
      rowMap.set(allRow.key, {
        key: allRow.key,
        values: allRow.values,
        labels: allRow.labels,
      });
      colMap.set(allCol.key, {
        key: allCol.key,
        values: allCol.values,
        labels: allCol.labels,
      });
    }

    return {
      rows: this.sortPivotAxisItems(Array.from(rowMap.values())),
      cols: this.sortPivotAxisItems(Array.from(colMap.values())),
      data: this.finalizePivotAccumulatorMap(cellAccumulators),
      rowTotals: this.finalizePivotAccumulatorMap(rowAccumulators),
      colTotals: this.finalizePivotAccumulatorMap(colAccumulators),
      grandTotal: isMultiValue
        ? this.finalizePivotAccumulatorMap(grandAccumulators)
        : this.finalizePivotAccumulator(grandAccumulator),
      summary: this.buildPivotSummary(logs),
    };
  }

  async getPivotFilterOptions(
    query: WorkLogPivotQueryDto,
  ): Promise<WorkLogPivotFilterOptions> {
    const where = this.buildPivotWhere(query);

    const [
      companyRows,
      clientRows,
      employeeRows,
      equipmentRows,
      machineTypeRows,
      startLocationRows,
      endLocationRows,
      contractRows,
      quotationRows,
      dayNightRows,
      serviceTypeRows,
      statusRows,
    ] = await Promise.all([
      this.prisma.workLog.findMany({
        where,
        distinct: ['company_id', 'company_profile_id'],
        select: {
          company_id: true,
          company_profile_id: true,
          company: { select: { name: true, internal_prefix: true } },
          company_profile: {
            select: {
              company_id: true,
              code: true,
              chinese_name: true,
              english_name: true,
              company: { select: { name: true, internal_prefix: true } },
            },
          },
        },
      }),
      this.prisma.workLog.findMany({
        where,
        distinct: ['client_id'],
        select: { client_id: true, client: { select: { name: true } } },
      }),
      this.prisma.workLog.findMany({
        where,
        distinct: ['employee_id'],
        select: {
          employee_id: true,
          employee: {
            select: { name_zh: true, name_en: true, emp_code: true },
          },
        },
      }),
      this.prisma.workLog.findMany({
        where,
        distinct: ['equipment_number'],
        select: { equipment_number: true },
      }),
      this.prisma.workLog.findMany({
        where,
        distinct: ['machine_type'],
        select: { machine_type: true },
      }),
      this.prisma.workLog.findMany({
        where,
        distinct: ['start_location'],
        select: { start_location: true },
      }),
      this.prisma.workLog.findMany({
        where,
        distinct: ['end_location'],
        select: { end_location: true },
      }),
      this.prisma.workLog.findMany({
        where,
        distinct: ['contract_id', 'client_contract_no'],
        select: {
          contract_id: true,
          client_contract_no: true,
          contract: { select: { contract_no: true } },
        },
      }),
      this.prisma.workLog.findMany({
        where,
        distinct: ['quotation_id'],
        select: {
          quotation_id: true,
          quotation: { select: { quotation_no: true } },
        },
      }),
      this.prisma.workLog.findMany({
        where,
        distinct: ['day_night'],
        select: { day_night: true },
      }),
      this.prisma.workLog.findMany({
        where,
        distinct: ['service_type'],
        select: { service_type: true },
      }),
      this.prisma.workLog.findMany({
        where,
        distinct: ['is_confirmed'],
        select: { is_confirmed: true },
      }),
    ]);

    return {
      companies: this.buildPivotCompanyFilterOptions(companyRows),
      clients: this.buildPivotRelationFilterOptions(
        clientRows,
        'client_id',
        (row) => row.client?.name,
      ),
      employees: this.buildPivotRelationFilterOptions(
        employeeRows,
        'employee_id',
        (row) =>
          row.employee?.name_zh ||
          row.employee?.name_en ||
          row.employee?.emp_code,
      ),
      equipment_numbers: this.buildPivotStringFilterOptions(
        equipmentRows,
        'equipment_number',
      ),
      machine_types: this.buildPivotStringFilterOptions(
        machineTypeRows,
        'machine_type',
      ),
      start_locations: this.buildPivotStringFilterOptions(
        startLocationRows,
        'start_location',
      ),
      end_locations: this.buildPivotStringFilterOptions(
        endLocationRows,
        'end_location',
      ),
      contracts: this.buildPivotContractFilterOptions(contractRows),
      quotations: this.buildPivotQuotationFilterOptions(quotationRows),
      day_nights: this.buildPivotStringFilterOptions(dayNightRows, 'day_night'),
      service_types: this.buildPivotStringFilterOptions(
        serviceTypeRows,
        'service_type',
      ),
      statuses: this.buildPivotStatusFilterOptions(statusRows),
    };
  }

  async getPivotSummary(
    query: WorkLogPivotQueryDto,
  ): Promise<WorkLogPivotSummary> {
    const result = await this.getPivot(query);
    return result.summary;
  }

  private normalizePivotFilterOptionValue(value: unknown): string {
    if (value === null || value === undefined) return '(空白)';
    const normalized = String(value).trim();
    return normalized || '(空白)';
  }

  private addPivotFilterOption(
    options: Map<string, PivotFilterOption>,
    value: unknown,
    label?: unknown,
  ): void {
    const optionValue = this.normalizePivotFilterOptionValue(value);
    const optionLabel =
      optionValue === '(空白)'
        ? '(空白)'
        : this.normalizePivotFilterOptionValue(label ?? value);
    if (!options.has(optionValue)) {
      options.set(optionValue, { value: optionValue, label: optionLabel });
    }
  }

  private sortPivotFilterOptions(
    options: Map<string, PivotFilterOption>,
  ): PivotFilterOption[] {
    return Array.from(options.values()).sort((a, b) => {
      if (a.value === '(空白)') return -1;
      if (b.value === '(空白)') return 1;
      return a.label.localeCompare(b.label, 'zh-Hant');
    });
  }

  private buildPivotStringFilterOptions<T extends Record<string, unknown>>(
    rows: T[],
    field: keyof T,
  ): PivotFilterOption[] {
    const options = new Map<string, PivotFilterOption>();
    rows.forEach((row) =>
      this.addPivotFilterOption(options, row[field], row[field]),
    );
    return this.sortPivotFilterOptions(options);
  }

  private buildPivotRelationFilterOptions<T extends Record<string, unknown>>(
    rows: T[],
    valueField: keyof T,
    getLabel: (row: T) => unknown,
  ): PivotFilterOption[] {
    const options = new Map<string, PivotFilterOption>();
    rows.forEach((row) =>
      this.addPivotFilterOption(options, row[valueField], getLabel(row)),
    );
    return this.sortPivotFilterOptions(options);
  }

  private buildPivotCompanyFilterOptions(
    rows: Array<Record<string, any>>,
  ): PivotFilterOption[] {
    const options = new Map<string, PivotFilterOption>();
    rows.forEach((row) => {
      const profile = row.company_profile;
      const profileCompany = profile?.company;
      const value = row.company_id ?? profile?.company_id;
      const label =
        row.company?.internal_prefix ||
        row.company?.name ||
        profileCompany?.internal_prefix ||
        profileCompany?.name ||
        profile?.code ||
        profile?.chinese_name ||
        profile?.english_name;
      this.addPivotFilterOption(options, value, label);
    });
    return this.sortPivotFilterOptions(options);
  }

  private buildPivotContractFilterOptions(
    rows: Array<Record<string, any>>,
  ): PivotFilterOption[] {
    const options = new Map<string, PivotFilterOption>();
    rows.forEach((row) => {
      const value =
        row.contract?.contract_no || row.client_contract_no || row.contract_id;
      this.addPivotFilterOption(options, value, value);
    });
    return this.sortPivotFilterOptions(options);
  }

  private buildPivotQuotationFilterOptions(
    rows: Array<Record<string, any>>,
  ): PivotFilterOption[] {
    const options = new Map<string, PivotFilterOption>();
    rows.forEach((row) => {
      const value = row.quotation?.quotation_no || row.quotation_id;
      this.addPivotFilterOption(options, value, value);
    });
    return this.sortPivotFilterOptions(options);
  }

  private buildPivotStatusFilterOptions(
    rows: Array<{ is_confirmed: boolean }>,
  ): PivotFilterOption[] {
    const values = new Set(rows.map((row) => row.is_confirmed));
    const options: PivotFilterOption[] = [];
    if (values.has(true)) options.push({ value: 'confirmed', label: '已確認' });
    if (values.has(false))
      options.push({ value: 'unconfirmed', label: '未確認' });
    return options;
  }

  private parsePivotDimensions(
    raw: string | undefined,
    fallback: PivotDimension[],
  ): PivotDimension[] {
    const source =
      raw === undefined || raw.trim() === '' ? fallback.join(',') : raw;
    const allowed = new Set<string>(PIVOT_DIMENSIONS);
    const dimensions: PivotDimension[] = [];
    for (const part of source.split(',')) {
      const value = part.trim();
      if (!value || value === 'none') continue;
      if (allowed.has(value) && !dimensions.includes(value as PivotDimension)) {
        dimensions.push(value as PivotDimension);
      }
    }
    return dimensions;
  }

  private parsePivotValueTypes(query: WorkLogPivotQueryDto): PivotValueType[] {
    const allowed = new Set<string>(PIVOT_VALUE_TYPES);
    const source =
      query.value_types && query.value_types.trim()
        ? query.value_types
        : query.value_type || 'quantity_sum';
    const valueTypes: PivotValueType[] = [];
    for (const part of source.split(',')) {
      const value = part.trim();
      if (allowed.has(value) && !valueTypes.includes(value as PivotValueType)) {
        valueTypes.push(value as PivotValueType);
      }
    }
    return valueTypes.length > 0 ? valueTypes : ['quantity_sum'];
  }

  private buildPivotWhere(
    query: WorkLogPivotQueryDto,
  ): Prisma.WorkLogWhereInput {
    const where: Prisma.WorkLogWhereInput = { deleted_at: null };

    if (query.date_from || query.date_to) {
      where.scheduled_date = {};
      if (query.date_from) where.scheduled_date.gte = new Date(query.date_from);
      if (query.date_to) where.scheduled_date.lte = new Date(query.date_to);
    }

    this.applyPivotCompanyFilter(where, query.company_ids || query.company_id);
    this.applyPivotNumberFilter(
      where,
      'client_id',
      query.client_ids || query.client_id,
    );
    this.applyPivotNumberFilter(
      where,
      'employee_id',
      query.employee_ids || query.employee_id,
    );
    this.applyPivotStringFilter(
      where,
      'equipment_number',
      query.equipment_numbers,
    );
    this.applyPivotStringFilter(
      where,
      'machine_type',
      query.machine_types || query.machine_type,
    );
    this.applyPivotStringFilter(where, 'tonnage', query.tonnage);
    this.applyPivotStringFilter(where, 'start_location', query.start_locations);
    this.applyPivotStringFilter(where, 'end_location', query.end_locations);
    this.applyPivotContractFilter(where, query.contracts);
    this.applyPivotQuotationFilter(where, query.quotations);
    this.applyPivotStringFilter(
      where,
      'day_night',
      query.day_nights || query.day_night,
    );
    this.applyPivotStringFilter(
      where,
      'service_type',
      query.service_types || query.service_type,
    );

    const confirmed = this.parsePivotConfirmationFilter(query.status);
    if (confirmed !== null) where.is_confirmed = confirmed;

    return where;
  }

  private getPivotNumberValues(raw: string | undefined): number[] {
    return this.splitFilterValues(raw)
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));
  }

  private makePivotNumberFilter(
    values: number[],
  ): number | { in: number[] } | undefined {
    if (values.length === 0) return undefined;
    return values.length === 1 ? values[0] : { in: values };
  }

  private makePivotStringFilter(
    values: string[],
  ): string | { in: string[] } | undefined {
    if (values.length === 0) return undefined;
    return values.length === 1 ? values[0] : { in: values };
  }

  private addPivotAndCondition(
    where: Prisma.WorkLogWhereInput,
    condition: Prisma.WorkLogWhereInput,
  ) {
    const existing = where.AND;
    where.AND = Array.isArray(existing)
      ? [...existing, condition]
      : existing
        ? [existing, condition]
        : [condition];
  }

  private applyPivotCompanyFilter(
    where: Prisma.WorkLogWhereInput,
    raw: string | undefined,
  ) {
    const values = this.splitFilterValues(raw);
    if (values.length === 0) return;
    const blankSelected = this.hasBlankFilterValue(values);
    const idFilter = this.makePivotNumberFilter(this.getPivotNumberValues(raw));
    const conditions: Prisma.WorkLogWhereInput[] = [];
    if (idFilter) {
      conditions.push({ company_id: idFilter });
      conditions.push({
        company_profile: { is: { company_id: idFilter } },
      } as Prisma.WorkLogWhereInput);
    }
    if (blankSelected) {
      conditions.push({ company_id: null, company_profile_id: null });
    }
    if (conditions.length > 0) {
      this.addPivotAndCondition(where, { OR: conditions });
    }
  }

  private applyPivotNumberFilter(
    where: Prisma.WorkLogWhereInput,
    field: 'client_id' | 'employee_id',
    raw: string | undefined,
  ) {
    const values = this.splitFilterValues(raw);
    if (values.length === 0) return;
    const blankSelected = this.hasBlankFilterValue(values);
    const numericFilter = this.makePivotNumberFilter(
      this.getPivotNumberValues(raw),
    );
    if (blankSelected && numericFilter) {
      this.addPivotAndCondition(where, {
        OR: [{ [field]: numericFilter }, { [field]: null }],
      });
    } else if (blankSelected) {
      where[field] = null;
    } else if (numericFilter) {
      where[field] = numericFilter;
    }
  }

  private applyPivotStringFilter(
    where: Prisma.WorkLogWhereInput,
    field:
      | 'equipment_number'
      | 'machine_type'
      | 'tonnage'
      | 'day_night'
      | 'service_type'
      | 'start_location'
      | 'end_location',
    raw: string | undefined,
  ) {
    const values = this.splitFilterValues(raw);
    if (values.length === 0) return;
    const nonBlank = this.getNonBlankFilterValues(values);
    const blankSelected = this.hasBlankFilterValue(values);
    if (blankSelected && nonBlank.length > 0) {
      // Include both blank (null/empty) and specific values
      this.addPivotAndCondition(where, {
        OR: [{ [field]: { in: nonBlank } }, { [field]: null }, { [field]: '' }],
      });
    } else if (blankSelected) {
      // Only blank selected
      this.addPivotAndCondition(where, {
        OR: [{ [field]: null }, { [field]: '' }],
      });
    } else {
      // Only non-blank values
      where[field] = nonBlank.length === 1 ? nonBlank[0] : { in: nonBlank };
    }
  }

  private applyPivotContractFilter(
    where: Prisma.WorkLogWhereInput,
    raw: string | undefined,
  ) {
    const values = this.splitFilterValues(raw);
    if (values.length === 0) return;
    const idFilter = this.makePivotNumberFilter(this.getPivotNumberValues(raw));
    const textFilter = this.makePivotStringFilter(values);
    const conditions: Prisma.WorkLogWhereInput[] = [];
    if (idFilter) conditions.push({ contract_id: idFilter });
    if (textFilter) {
      conditions.push({ client_contract_no: textFilter });
      conditions.push({
        contract: { is: { contract_no: textFilter } },
      } as Prisma.WorkLogWhereInput);
    }
    this.addPivotAndCondition(where, { OR: conditions });
  }

  private applyPivotQuotationFilter(
    where: Prisma.WorkLogWhereInput,
    raw: string | undefined,
  ) {
    const values = this.splitFilterValues(raw);
    if (values.length === 0) return;
    const idFilter = this.makePivotNumberFilter(this.getPivotNumberValues(raw));
    const textFilter = this.makePivotStringFilter(values);
    const conditions: Prisma.WorkLogWhereInput[] = [];
    if (idFilter) conditions.push({ quotation_id: idFilter });
    if (textFilter)
      conditions.push({
        quotation: { is: { quotation_no: textFilter } },
      } as Prisma.WorkLogWhereInput);
    this.addPivotAndCondition(where, { OR: conditions });
  }

  private parsePivotConfirmationFilter(
    raw: string | undefined,
  ): boolean | null {
    const values = this.splitFilterValues(raw).map((value) =>
      value.toLowerCase(),
    );
    const confirmedValues = new Set(['confirmed', 'true', '1', '已確認']);
    const unconfirmedValues = new Set(['unconfirmed', 'false', '0', '未確認']);
    const hasConfirmed = values.some((value) => confirmedValues.has(value));
    const hasUnconfirmed = values.some((value) => unconfirmedValues.has(value));
    if (hasConfirmed && !hasUnconfirmed) return true;
    if (hasUnconfirmed && !hasConfirmed) return false;
    return null;
  }

  private getPivotAxisParts(
    log: PivotWorkLogRecord,
    fields: PivotDimension[],
  ): PivotAxisParts {
    const labels = fields.map((field) =>
      this.getPivotDimensionLabel(log, field),
    );
    return this.makePivotAxisParts(labels, labels);
  }

  private makePivotAxisParts(
    values: string[],
    labels: string[],
  ): PivotAxisParts {
    const safeValues = values.length > 0 ? values : ['全部'];
    const safeLabels = labels.length > 0 ? labels : ['全部'];
    return {
      values: safeValues,
      labels: safeLabels,
      key: safeValues.map((value) => encodeURIComponent(value)).join('~'),
    };
  }

  private getPivotDimensionLabel(
    log: PivotWorkLogRecord,
    field: PivotDimension,
  ): string {
    const blank = '(空白)';
    switch (field) {
      case 'employee':
        return (
          log.employee?.name_zh ||
          log.fleet_driver?.name_zh ||
          log.fleet_driver?.short_name ||
          blank
        );
      case 'equipment_number':
        return log.equipment_number || blank;
      case 'client':
        return log.client?.name || blank;
      case 'company':
        return (
          log.company?.internal_prefix ||
          log.company?.name ||
          log.company_profile?.code ||
          log.company_profile?.chinese_name ||
          log.company_profile?.english_name ||
          blank
        );
      case 'machine_type':
        return log.machine_type || blank;
      case 'start_location':
        return log.start_location || blank;
      case 'end_location':
        return log.end_location || blank;
      case 'contract':
        return log.contract?.contract_no || log.client_contract_no || blank;
      case 'quotation':
        return log.quotation?.quotation_no || blank;
      case 'scheduled_date':
        if (log.scheduled_date instanceof Date) {
          return log.scheduled_date.toISOString().split('T')[0];
        }
        return log.scheduled_date
          ? String(log.scheduled_date).split('T')[0]
          : blank;
      case 'week':
        return this.formatPivotWeek(log.scheduled_date) || blank;
      case 'month':
        return this.formatPivotMonth(log.scheduled_date) || blank;
      case 'day_night':
        return log.day_night || blank;
      case 'service_type':
        return log.service_type || blank;
      case 'none':
        return '全部';
    }
  }

  private getPivotMetricForLog(
    log: PivotWorkLogRecord,
    valueType: PivotValueType,
  ): PivotMetric {
    switch (valueType) {
      case 'count':
        return { value: 1, unit: '筆' };
      case 'quantity_sum':
        return {
          value: this.toPivotNumber(log.quantity),
          unit: log.unit || '',
        };
      case 'goods_quantity_sum':
        return { value: this.toPivotNumber(log.goods_quantity), unit: '件' };
      case 'ot_sum':
        return {
          value: this.toPivotNumber(log.ot_quantity),
          unit: log.ot_unit || '',
        };
      case 'mid_shift_count':
        return { value: log.is_mid_shift ? 1 : 0, unit: '次' };
    }
  }

  private createPivotAccumulator(): PivotAccumulator {
    return { value: 0, units: new Map<string, number>() };
  }

  private addPivotMetric(
    map: Map<string, PivotAccumulator>,
    key: string,
    value: number,
    unit: string,
  ) {
    if (!map.has(key)) map.set(key, this.createPivotAccumulator());
    const accumulator = map.get(key);
    if (accumulator) this.addToPivotAccumulator(accumulator, value, unit);
  }

  private addToPivotAccumulator(
    accumulator: PivotAccumulator,
    value: number,
    unit: string,
  ) {
    accumulator.value += value;
    const normalizedUnit = unit || '';
    accumulator.units.set(
      normalizedUnit,
      (accumulator.units.get(normalizedUnit) || 0) + 1,
    );
  }

  private finalizePivotAccumulatorMap(
    map: Map<string, PivotAccumulator>,
  ): Record<string, PivotMetric> {
    const result: Record<string, PivotMetric> = {};
    for (const [key, accumulator] of map.entries()) {
      result[key] = this.finalizePivotAccumulator(accumulator);
    }
    return result;
  }

  private finalizePivotAccumulator(accumulator: PivotAccumulator): PivotMetric {
    const value = Number(accumulator.value.toFixed(2));
    return { value, unit: this.getPrimaryPivotUnit(accumulator.units) };
  }

  private getPrimaryPivotUnit(units: Map<string, number>): string {
    let selected = '';
    let selectedCount = -1;
    for (const [unit, count] of units.entries()) {
      if (count > selectedCount && unit) {
        selected = unit;
        selectedCount = count;
      }
    }
    if (selected) return selected;
    const first = units.keys().next();
    return first.done ? '' : first.value;
  }

  private sortPivotAxisItems(items: PivotAxisItem[]): PivotAxisItem[] {
    return items.sort((a, b) =>
      a.labels.join('\u0000').localeCompare(b.labels.join('\u0000'), 'zh-Hant'),
    );
  }

  private buildPivotSummary(logs: PivotWorkLogRecord[]): WorkLogPivotSummary {
    const employees = new Set<string>();
    const equipment = new Set<string>();
    let totalQuantity = 0;
    let confirmedCount = 0;
    let matchedCount = 0;

    for (const log of logs) {
      totalQuantity += this.toPivotNumber(log.quantity);
      if (log.is_confirmed) confirmedCount += 1;
      if (log.price_match_status === 'matched' || log.matched_rate_card_id)
        matchedCount += 1;
      if (log.employee_id) employees.add(`employee:${log.employee_id}`);
      if (log.work_log_fleet_driver_id)
        employees.add(`fleet:${log.work_log_fleet_driver_id}`);
      if (log.equipment_number) equipment.add(log.equipment_number);
    }

    return {
      totalRecords: logs.length,
      confirmedCount,
      totalQuantity: Number(totalQuantity.toFixed(2)),
      priceMatchRate:
        logs.length > 0 ? Number((matchedCount / logs.length).toFixed(3)) : 0,
      employeeCount: employees.size,
      equipmentCount: equipment.size,
    };
  }

  private toPivotNumber(value: unknown): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    if (
      typeof value === 'object' &&
      'toNumber' in value &&
      typeof value.toNumber === 'function'
    ) {
      const parsed = value.toNumber();
      return Number.isFinite(parsed) ? parsed : 0;
    }
    if (
      typeof value === 'object' &&
      'toString' in value &&
      typeof value.toString === 'function'
    ) {
      const parsed = Number(value.toString());
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }

  private formatPivotMonth(value: Date | null): string {
    const date = this.formatHongKongDate(value);
    return date ? date.slice(0, 7) : '';
  }

  private formatPivotWeek(value: Date | null): string {
    const dateText = this.formatHongKongDate(value);
    if (!dateText) return '';
    const [yearText, monthText, dayText] = dateText.split('-');
    const date = new Date(
      Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText)),
    );
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - day);
    const weekYear = date.getUTCFullYear();
    const yearStart = new Date(Date.UTC(weekYear, 0, 1));
    const week = Math.ceil(
      ((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
    );
    return `${weekYear}-W${String(week).padStart(2, '0')}`;
  }

  // ── 缺單價組合筛選選項 ─────────────────────────────────────

  async getUnmatchedFilterOptions(column: string): Promise<string[]> {
    const COLUMN_MAP: Record<string, string> = {
      company_name: `COALESCE(co.name, cp.name)`,
      client_name: `cl.name`,
      client_contract_no: `wl.client_contract_no`,
      service_type: `wl.service_type`,
      quotation_no: `q.quotation_no`,
      day_night: `wl.day_night`,
      tonnage: `wl.tonnage`,
      machine_type: `wl.machine_type`,
      start_location: `wl.start_location`,
      end_location: `wl.end_location`,
    };
    const expr = COLUMN_MAP[column];
    if (!expr) return [];
    const sql = `
      SELECT DISTINCT ${expr} AS val
      FROM work_logs wl
      LEFT JOIN companies co ON co.id = wl.company_id
      LEFT JOIN companies cp ON cp.id = wl.company_profile_id
      LEFT JOIN partners cl ON cl.id = wl.client_id
      LEFT JOIN quotations q ON q.id = wl.quotation_id
      WHERE wl.deleted_at IS NULL AND (wl.client_price_match_status = 'unmatched' OR wl.client_price_match_status IS NULL)
        AND ${expr} IS NOT NULL
      ORDER BY val ASC
      LIMIT 500
    `;
    const rows = await this.prisma.$queryRawUnsafe<{ val: string }[]>(sql);
    return rows.map((r) => String(r.val)).filter(Boolean);
  }

  // ── 輔助方法 ─────────────────────────────────────────────

  private resolveEquipmentSource(
    machineType: string | null | undefined,
  ): 'vehicle' | 'machinery' | null {
    if (!machineType) return null;
    if (VEHICLE_TYPES.includes(machineType)) return 'vehicle';
    if (MACHINERY_TYPES.includes(machineType)) return 'machinery';
    return null;
  }
}
