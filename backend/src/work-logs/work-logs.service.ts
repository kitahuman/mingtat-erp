import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../common/pricing.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { OrderByClause, WhereClause, WorkLogQuery } from '../common/types';
import {
  UnmatchedCombinationsQueryDto,
  AddRateAndRematchDto,
  UnmatchedCombinationRow,
  UnmatchedCombinationsResult,
} from './dto/unmatched-combinations.dto';

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

@Injectable()
export class WorkLogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricingService: PricingService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  // ── 工作記錄 CRUD ─────────────────────────────────────────

  async findAll(query: WorkLogQuery) {
    const {
      page = 1,
      limit = 25,
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
      sortBy = 'created_at',
      sortOrder = 'DESC',
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
      where.start_location = { contains: String(start_location), mode: 'insensitive' };
    }
    if (end_location) {
      where.end_location = { contains: String(end_location), mode: 'insensitive' };
    }
    if (work_order_no) {
      where.work_order_no = { contains: String(work_order_no), mode: 'insensitive' };
    }
    if (receipt_no) {
      where.receipt_no = { contains: String(receipt_no), mode: 'insensitive' };
    }
    if (work_log_product_name) {
      where.work_log_product_name = { contains: String(work_log_product_name), mode: 'insensitive' };
    }
    this.applyColumnFilters(where, query);

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
    // Relation fields that need nested orderBy
    const relationSortMap: Record<string, any> = {
      publisher: {
        publisher: { displayName: sortOrder === 'ASC' ? 'asc' : 'desc' },
      },
      company: { company: { name: sortOrder === 'ASC' ? 'asc' : 'desc' } },
      client: { client: { name: sortOrder === 'ASC' ? 'asc' : 'desc' } },
      quotation: {
        quotation: { quotation_no: sortOrder === 'ASC' ? 'asc' : 'desc' },
      },
      contract: {
        contract: { contract_no: sortOrder === 'ASC' ? 'asc' : 'desc' },
      },
      employee: { employee: { name_zh: sortOrder === 'ASC' ? 'asc' : 'desc' } },
      client_contract_no: {
        client_contract_no: sortOrder === 'ASC' ? 'asc' : 'desc',
      },
    };
    const safeSortOrder = sortOrder === 'ASC' ? 'asc' : 'desc';
    let orderBy: OrderByClause;
    if (relationSortMap[sortBy]) {
      orderBy = relationSortMap[sortBy];
    } else if (allowedSort.includes(sortBy)) {
      orderBy = { [sortBy]: safeSortOrder };
    } else {
      orderBy = { scheduled_date: 'desc' };
    }

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

  private readonly relationFilterConfig: Record<string, { relation: string; field: string; foreignKey: string }> = {
    publisher: { relation: 'publisher', field: 'displayName', foreignKey: 'publisher_id' },
    company: { relation: 'company', field: 'name', foreignKey: 'company_id' },
    client: { relation: 'client', field: 'name', foreignKey: 'client_id' },
    quotation: { relation: 'quotation', field: 'quotation_no', foreignKey: 'quotation_id' },
    contract: { relation: 'contract', field: 'contract_no', foreignKey: 'contract_id' },
    employee: { relation: 'employee', field: 'name_zh', foreignKey: 'employee_id' },
  };

  private readonly dateFilterFields = ['scheduled_date', 'wl_whatsapp_reported_at'];
  private readonly booleanFilterFields = ['is_mid_shift', 'is_confirmed', 'is_paid'];
  private readonly numericFilterFields = ['quantity', 'ot_quantity', 'goods_quantity'];

  private splitFilterValues(raw: unknown): string[] {
    if (!raw) return [];
    return String(raw).split(',').map((v) => v.trim()).filter(Boolean);
  }

  private parseHongKongDateTime(value: string): Date | null {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if (!match) return null;
    const [, year, month, day, hour = '00', minute = '00', second = '00'] = match;
    const utcMs = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour) - 8, Number(minute), Number(second));
    return new Date(utcMs);
  }

  private formatHongKongDate(value: Date | null | undefined, includeTime = false): string {
    if (!value) return '';
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Hong_Kong',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      ...(includeTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
    });
    return formatter.format(value).replace(', ', ' ');
  }

  private makeDateRange(value: string) {
    const start = this.parseHongKongDateTime(value);
    if (!start) return undefined;
    const end = new Date(start);
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      end.setUTCDate(end.getUTCDate() + 1);
    } else {
      end.setUTCMinutes(end.getUTCMinutes() + 1);
    }
    return { gte: start, lt: end };
  }

  private applyColumnFilters(where: WhereClause, query: WorkLogQuery, excludeColumn?: string) {
    for (const field of this.columnFilterFields) {
      if (field === excludeColumn) continue;
      const vals = this.splitFilterValues((query as any)[`filter_${field}`]);
      if (vals.length === 0) continue;

      const relation = this.relationFilterConfig[field];
      if (relation) {
        const nonBlank = vals.filter((v) => v !== '(空白)');
        const conditions: any[] = [];
        if (nonBlank.length > 0) {
          conditions.push({ [relation.relation]: { [relation.field]: { in: nonBlank } } });
        }
        if (vals.includes('(空白)')) conditions.push({ [relation.foreignKey]: null });
        if (conditions.length === 1) Object.assign(where, conditions[0]);
        else if (conditions.length > 1) where.AND = [...((where.AND as any[]) || []), { OR: conditions }];
        continue;
      }

      if (this.dateFilterFields.includes(field)) {
        const ranges = vals.map((v) => this.makeDateRange(v)).filter(Boolean) as Array<{ gte: Date; lt: Date }>;
        if (ranges.length === 1) where[field] = ranges[0];
        else if (ranges.length > 1) where.AND = [...((where.AND as any[]) || []), { OR: ranges.map((range) => ({ [field]: range })) }];
        continue;
      }

      if (this.booleanFilterFields.includes(field)) {
        const bools = vals
          .map((v) => (v === '是' || v === 'true' ? true : v === '否' || v === 'false' ? false : null))
          .filter((v) => v !== null) as boolean[];
        if (bools.length === 1) where[field] = bools[0];
        else if (bools.length > 1) where[field] = { in: bools };
        continue;
      }

      if (this.numericFilterFields.includes(field)) {
        const nums = vals.map(Number).filter((num) => !Number.isNaN(num));
        if (nums.length === 1) where[field] = nums[0];
        else if (nums.length > 1) where[field] = { in: nums };
        continue;
      }

      const nonBlank = vals.filter((v) => v !== '(空白)');
      const blankSelected = vals.includes('(空白)');
      if (blankSelected && nonBlank.length > 0) {
        where.AND = [...((where.AND as any[]) || []), { OR: [{ [field]: { in: nonBlank } }, { [field]: null }, { [field]: '' }] }];
      } else if (blankSelected) {
        where.AND = [...((where.AND as any[]) || []), { OR: [{ [field]: null }, { [field]: '' }] }];
      } else if (nonBlank.length === 1) {
        where[field] = nonBlank[0];
      } else if (nonBlank.length > 1) {
        where[field] = { in: nonBlank };
      }
    }
  }

  /**
   * 取得指定欄位的不重複值清單，供前端欄標題篩選器使用。
   * 會套用其他篩選條件，但排除目標欄位自身篩選。
   */
  async getFilterOptions(column: string, query: WorkLogQuery = {}): Promise<string[]> {
    if (!this.columnFilterFields.includes(column)) return [];

    const where: WhereClause = { deleted_at: null };
    this.applyColumnFilters(where, query, column);

    const relation = this.relationFilterConfig[column];
    if (relation) {
      const rows = await this.prisma.workLog.findMany({
        where,
        select: { [relation.relation]: { select: { [relation.field]: true } } } as any,
        take: 2000,
      });
      return Array.from(new Set(rows.map((row: any) => row[relation.relation]?.[relation.field] || '(空白)')))
        .sort((a, b) => a.localeCompare(b, 'zh-Hant'))
        .slice(0, 500);
    }

    if (this.dateFilterFields.includes(column)) {
      const rows = await this.prisma.workLog.findMany({
        where: { ...where, [column]: { not: null } },
        select: { [column]: true } as any,
        orderBy: { [column]: 'desc' } as any,
        take: 2000,
      });
      return Array.from(new Set(rows.map((row: any) => this.formatHongKongDate(row[column], column === 'wl_whatsapp_reported_at')).filter(Boolean))).slice(0, 500);
    }

    if (this.booleanFilterFields.includes(column)) {
      const rows = await this.prisma.workLog.findMany({ where, select: { [column]: true } as any, distinct: [column as any], take: 500 });
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
      .map((row: any) => (row[column] == null || row[column] === '' ? '(空白)' : String(row[column])))
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
    return this.findOne(saved.id);
  }

  async update(id: number, dto: any, userId?: number, ipAddress?: string) {
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
      try {
        const afterWl = await this.prisma.workLog.findUnique({ where: { id } });
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
    ];
    const hasPriceChange = priceRelatedFields.some((f) => f in rest);
    if (hasPriceChange) {
      const updatedWl = await this.findOne(id);
      if (updatedWl) {
        await this.matchAndSavePrice(updatedWl as any);
      }
    }
    return this.findOne(id);
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

  async bulkUpdate(ids: number[], field: string, value: any) {
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
    if (field === 'machine_type') {
      // Also update equipment_source
      const equipmentSource = this.resolveEquipmentSource(processedValue);
      await this.prisma.workLog.updateMany({
        where: { id: { in: ids } },
        data: {
          machine_type: processedValue,
          equipment_source: equipmentSource,
        },
      });
      // Re-match prices for affected records
      const priceRelatedFields = ['machine_type'];
      if (priceRelatedFields.includes(field)) {
        const updatedLogs = await this.prisma.workLog.findMany({
          where: { id: { in: ids } },
          include: { company: true, client: true },
        });
        await Promise.all(
          updatedLogs.map((log) => this.matchAndSavePrice(log)),
        );
      }
      return { success: true, updated: ids.length };
    }

    await this.prisma.workLog.updateMany({
      where: { id: { in: ids } },
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
    ];
    if (priceRelatedFields.includes(field)) {
      const updatedLogs = await this.prisma.workLog.findMany({
        where: { id: { in: ids } },
        include: { company: true, client: true },
      });
      await Promise.all(updatedLogs.map((log) => this.matchAndSavePrice(log)));
    }

    return { success: true, updated: ids.length };
  }

  async bulkConfirm(ids: number[]) {
    await this.prisma.workLog.updateMany({
      where: { id: { in: ids } },
      data: { is_confirmed: true },
    });
    return { success: true, confirmed: ids.length };
  }

  async bulkUnconfirm(ids: number[]) {
    await this.prisma.workLog.updateMany({
      where: { id: { in: ids } },
      data: { is_confirmed: false },
    });
    return { success: true, unconfirmed: ids.length };
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
        },
      });
      return;
    }

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

    if (!card) {
      await this.prisma.workLog.update({
        where: { id: workLog.id },
        data: {
          price_match_status: 'unmatched',
          price_match_note:
            unmatchedReason || '找不到對應的租賃價目表，請人工處理',
          matched_rate_card_id: null,
          matched_rate: null,
          matched_unit: null,
          matched_ot_rate: null,
        },
      });
      return;
    }

    const { rate, unit } = this.pricingService.resolveRate(
      card,
      workLog.day_night,
    );

    await this.prisma.workLog.update({
      where: { id: workLog.id },
      data: {
        price_match_status: 'matched',
        price_match_note: `匹配到：${card.name || card.client_contract_no || `FleetRC#${card.id}`}`,
        matched_rate_card_id: card.id,
        matched_rate: rate,
        matched_unit: unit,
        matched_ot_rate: card.ot_rate ?? null,
      },
    });
  }

  // tryMatchRateCard 和 resolveRate 已移至 PricingService

  // ── 批量儲存 (Airtable 風格) ───────────────────────────

  async bulkSave(changes: Array<{ id: number; data: any }>) {
    const results: any[] = [];
    for (const { id, data } of changes) {
      try {
        const updated = await this.update(id, data);
        results.push({ id, success: true, data: updated });
      } catch (e: any) {
        results.push({ id, success: false, error: e.message });
      }
    }
    return {
      results,
      saved: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
    };
  }

  // ── 編輯鎖定 (簡易在記憶體實作) ─────────────────────

  private static editLocks = new Map<
    string,
    { userId: number; userName: string; timestamp: number }
  >();

  acquireEditLock(lockKey: string, userId: number, userName: string) {
    const existing = WorkLogsService.editLocks.get(lockKey);
    const now = Date.now();
    // Lock expires after 5 minutes of no heartbeat
    if (
      existing &&
      existing.userId !== userId &&
      now - existing.timestamp < 5 * 60 * 1000
    ) {
      return {
        acquired: false,
        lockedBy: existing.userName,
        lockedAt: existing.timestamp,
      };
    }
    WorkLogsService.editLocks.set(lockKey, {
      userId,
      userName,
      timestamp: now,
    });
    return { acquired: true };
  }

  heartbeatEditLock(lockKey: string, userId: number) {
    const existing = WorkLogsService.editLocks.get(lockKey);
    if (existing && existing.userId === userId) {
      existing.timestamp = Date.now();
      return { ok: true };
    }
    return { ok: false };
  }

  releaseEditLock(lockKey: string, userId: number) {
    const existing = WorkLogsService.editLocks.get(lockKey);
    if (existing && existing.userId === userId) {
      WorkLogsService.editLocks.delete(lockKey);
    }
    return { ok: true };
  }

  getEditLockStatus(lockKey: string, userId: number) {
    const existing = WorkLogsService.editLocks.get(lockKey);
    const now = Date.now();
    if (!existing || now - existing.timestamp >= 5 * 60 * 1000) {
      return { locked: false };
    }
    return {
      locked: true,
      lockedBy: existing.userName,
      isMe: existing.userId === userId,
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
      `wl.price_match_status = 'unmatched'`,
    ];
    const params: (string | number)[] = [];
    let paramIdx = 1;

    if (query.company_id) {
      conditions.push(`COALESCE(wl.company_id, wl.company_profile_id) = $${paramIdx++}`);
      params.push(Number(query.company_id));
    }
    if (query.client_id) {
      conditions.push(`wl.client_id = $${paramIdx++}`);
      params.push(Number(query.client_id));
    }
    if (query.client_contract_no) {
      conditions.push(`wl.client_contract_no = $${paramIdx++}`);
      params.push(query.client_contract_no);
    }
    if (query.service_type) {
      conditions.push(`wl.service_type = $${paramIdx++}`);
      params.push(query.service_type);
    }
    if (query.quotation_id) {
      conditions.push(`wl.quotation_id = $${paramIdx++}`);
      params.push(Number(query.quotation_id));
    }
    if (query.day_night) {
      conditions.push(`wl.day_night = $${paramIdx++}`);
      params.push(query.day_night);
    }
    if (query.tonnage) {
      conditions.push(`wl.tonnage = $${paramIdx++}`);
      params.push(query.tonnage);
    }
    if (query.machine_type) {
      conditions.push(`wl.machine_type = $${paramIdx++}`);
      params.push(query.machine_type);
    }
    if (query.start_location) {
      conditions.push(`wl.start_location = $${paramIdx++}`);
      params.push(query.start_location);
    }
    if (query.end_location) {
      conditions.push(`wl.end_location = $${paramIdx++}`);
      params.push(query.end_location);
    }

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
    const countResult = await this.prisma.$queryRawUnsafe<{ total: number }[]>(countSql, ...params);
    const total = Number(countResult[0]?.total || 0);

    // Count total unmatched work_logs
    const unmatchedCountSql = `SELECT COUNT(*)::int AS cnt FROM work_logs wl WHERE wl.deleted_at IS NULL AND wl.price_match_status = 'unmatched'`;
    const unmatchedResult = await this.prisma.$queryRawUnsafe<{ cnt: number }[]>(unmatchedCountSql);
    const totalUnmatched = Number(unmatchedResult[0]?.cnt || 0);

    // Main query with pagination
    const offset = (page - 1) * limit;
    const dataSql = `SELECT ${selectCols} ${fromClause} WHERE ${whereClause} GROUP BY ${groupByCols} ORDER BY ${sortCol} ${sortDir} NULLS LAST LIMIT ${limit} OFFSET ${offset}`;
    const rawRows = await this.prisma.$queryRawUnsafe<Record<string, unknown>[]>(dataSql, ...params);

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
    // 1. Create fleet_rate_card
    const rateCardData: Record<string, unknown> = {
      client_id: dto.client_id || undefined,
      company_id: dto.company_id || undefined,
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
      effective_date: dto.effective_date ? new Date(dto.effective_date) : new Date(),
      status: 'active',
    };

    // Remove undefined keys
    const cleanData: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rateCardData)) {
      if (v !== undefined) cleanData[k] = v;
    }

    const saved = await this.prisma.fleetRateCard.create({ data: cleanData as never });

    // 2. Find affected unmatched work_logs with matching conditions
    const where: Record<string, unknown> = {
      deleted_at: null,
      price_match_status: 'unmatched',
    };
    if (dto.client_id) where.client_id = dto.client_id;
    if (dto.company_id) {
      where.OR = [
        { company_id: dto.company_id },
        { company_profile_id: dto.company_id },
      ];
    }
    if (dto.client_contract_no) where.client_contract_no = dto.client_contract_no;
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
      WHERE wl.deleted_at IS NULL AND wl.price_match_status = 'unmatched'
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
