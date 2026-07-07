import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { DailyReportVerificationService } from '../verification/daily-report-verification.service';

@Injectable()
export class DailyReportsService {
  constructor(
    private prisma: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly dailyReportVerificationService: DailyReportVerificationService,
  ) {}

  /**
   * Confirm an unconfirmed project: create a real Project record from a daily-report
   * project_name that has no project_id yet, and back-fill daily_report_project_id
   * on all matching daily reports.
   */
  async confirmProject(userId: number, dto: {
    project_name: string;
    company_id: number;
    client_id?: number;
    contract_id?: number;
    address?: string;
    start_date?: string;
    end_date?: string;
    description?: string;
    status?: string;
  }, ipAddress?: string) {
    if (!dto.project_name || !dto.project_name.trim()) {
      throw new BadRequestException('工程名稱不可為空');
    }
    if (!dto.company_id) {
      throw new BadRequestException('請選擇內部公司');
    }
    const trimmedName = dto.project_name.trim();

    // 1. Confirm that at least one daily report uses this name with NULL project_id
    const unconfirmedCount = await this.prisma.dailyReport.count({
      where: {
        daily_report_project_name: trimmedName,
        daily_report_project_id: null,
        daily_report_deleted_at: null,
      },
    });
    if (unconfirmedCount === 0) {
      throw new NotFoundException('找不到未確認的工程日報記錄');
    }

    // 2. Use existing ProjectsService.create (handles project_no generation, client/contract resolution, audit log)
    const created = await this.projectsService.create(
      {
        project_name: trimmedName,
        company_id: Number(dto.company_id),
        client_id: dto.client_id ? Number(dto.client_id) : undefined,
        contract_id: dto.contract_id ? Number(dto.contract_id) : undefined,
        address: dto.address || undefined,
        start_date: dto.start_date || undefined,
        end_date: dto.end_date || undefined,
        description: dto.description || undefined,
        status: dto.status || 'active',
      },
      userId,
      ipAddress,
    );

    // 3. Back-fill daily_report_project_id on matching reports (and sync client/contract if daily report has NULL)
    const contract = created.contract_id
      ? await this.prisma.contract.findUnique({
          where: { id: created.contract_id },
          select: { contract_no: true },
        })
      : null;
    const clientRecord = created.client_id
      ? await this.prisma.partner.findUnique({
          where: { id: created.client_id },
          select: { name: true },
        })
      : null;

    const updateResult = await this.prisma.dailyReport.updateMany({
      where: {
        daily_report_project_name: trimmedName,
        daily_report_project_id: null,
        daily_report_deleted_at: null,
      },
      data: {
        daily_report_project_id: created.id,
        daily_report_project_location: created.address ?? undefined,
        daily_report_client_id: created.client_id ?? undefined,
        daily_report_client_name: clientRecord?.name ?? undefined,
        daily_report_client_contract_no: contract?.contract_no ?? undefined,
      },
    });

    return {
      project: created,
      updated_reports: updateResult.count,
    };
  }

  private readonly includeAll = {
    project: { select: { id: true, project_no: true, project_name: true, address: true, client: { select: { id: true, name: true } }, contract: { select: { id: true, contract_no: true } } } },
    client: { select: { id: true, name: true } },
    creator: { select: { id: true, displayName: true } },
    quotation: { select: { id: true, quotation_no: true, contract_name: true, project_name: true, client: { select: { id: true, name: true } } } },
    items: { orderBy: { daily_report_item_sort_order: 'asc' as const } },
    attachments: { orderBy: { daily_report_attachment_sort_order: 'asc' as const } },
  };

  private readonly allowedSortFields = [
    'id', 'daily_report_date', 'daily_report_status', 'daily_report_shift_type',
    'daily_report_project_name', 'daily_report_client_name', 'daily_report_client_contract_no',
    'daily_report_project_location', 'created_at', 'daily_report_created_at',
  ];

  // Columns supported by the column-header filter (filter_xxx params + filter-options API)
  private readonly columnFilterFields = [
    'daily_report_date',
    'daily_report_status',
    'daily_report_shift_type',
    'daily_report_project_name',
    'daily_report_project_location',
    'daily_report_client_name',
    'daily_report_client_contract_no',
    'creator',
  ];

  // Relation columns: filter/options resolved through a Prisma relation
  private readonly relationFilterConfig: Record<
    string,
    { relation: string; field: string; foreignKey: string }
  > = {
    creator: { relation: 'creator', field: 'displayName', foreignKey: 'daily_report_created_by' },
  };

  private readonly dateFilterFields = ['daily_report_date'];

  // ── Filter value helpers (same semantics as work-logs) ─────────

  private splitFilterValues(raw: unknown): string[] {
    if (raw === null || raw === undefined) return [];
    if (raw === '') return [''];
    if (Array.isArray(raw)) {
      return raw.map((v) => String(v).trim()).filter((v) => v.length > 0);
    }
    const rawString = String(raw);
    const trimmed = rawString.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed
            .filter(
              (v): v is string | number | boolean =>
                ['string', 'number', 'boolean'].includes(typeof v),
            )
            .map((v) => String(v).trim())
            .filter((v) => v.length > 0);
        }
      } catch {
        // fall through to comma-separated parsing
      }
    }
    return rawString.split(',').map((v) => v.trim()).filter((v) => v.length > 0);
  }

  private isBlankFilterValue(value: string): boolean {
    return value === '(空白)' || value === '__BLANK__' || value === '';
  }

  private getNonBlankFilterValues(values: string[]): string[] {
    return values.filter((v) => !this.isBlankFilterValue(v));
  }

  private hasBlankFilterValue(values: string[]): boolean {
    return values.some((v) => this.isBlankFilterValue(v));
  }

  private appendAndCondition(where: any, condition: any): void {
    const existing = Array.isArray(where.AND) ? where.AND : [];
    where.AND = [...existing, condition];
  }

  private applyOrConditions(where: any, conditions: any[]): void {
    if (conditions.length === 0) return;
    if (conditions.length === 1) {
      this.appendAndCondition(where, conditions[0]);
      return;
    }
    this.appendAndCondition(where, { OR: conditions });
  }

  private makeDateRange(value: string) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      // daily_report_date is a DATE column — no timezone conversion.
      const start = new Date(`${value}T00:00:00.000Z`);
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 1);
      return { gte: start, lt: end };
    }
    return undefined;
  }

  // ── Column-header filters ───────────────────────────────────────

  private applyColumnFilters(where: any, query: any, excludeColumn?: string) {
    for (const field of this.columnFilterFields) {
      if (field === excludeColumn) continue;
      const vals = this.splitFilterValues(query[`filter_${field}`]);
      if (vals.length === 0) continue;

      const nonBlank = this.getNonBlankFilterValues(vals);
      const blankSelected = this.hasBlankFilterValue(vals);
      const relation = this.relationFilterConfig[field];

      if (relation) {
        const conditions: any[] = [];
        if (nonBlank.length > 0) {
          conditions.push({
            [relation.relation]: { [relation.field]: { in: nonBlank } },
          });
        }
        if (blankSelected) {
          conditions.push({ [relation.foreignKey]: null });
        }
        this.applyOrConditions(where, conditions);
        continue;
      }

      if (this.dateFilterFields.includes(field)) {
        const ranges = nonBlank
          .map((v) => this.makeDateRange(v))
          .filter((r): r is { gte: Date; lt: Date } => Boolean(r));
        const conditions: any[] = ranges.map((range) => ({ [field]: range }));
        if (blankSelected) conditions.push({ [field]: null });
        this.applyOrConditions(where, conditions);
        continue;
      }

      const conditions: any[] = [];
      if (nonBlank.length === 1) conditions.push({ [field]: nonBlank[0] });
      else if (nonBlank.length > 1)
        conditions.push({ [field]: { in: nonBlank } });
      if (blankSelected) conditions.push({ [field]: null }, { [field]: '' });
      this.applyOrConditions(where, conditions);
    }
  }

  // ── Shared where builder for findAll / getFilterOptions ─────────────────

  private buildDailyReportWhere(query: any, excludeColumnFilter?: string) {
    const where: any = { daily_report_deleted_at: null };

    if (query.project_id) where.daily_report_project_id = Number(query.project_id);
    if (query.project_name) where.daily_report_project_name = { contains: query.project_name, mode: 'insensitive' };
    if (query.status) where.daily_report_status = query.status;
    if (query.created_by) where.daily_report_created_by = Number(query.created_by);
    if (query.client_id) where.daily_report_client_id = Number(query.client_id);
    if (query.client_name) where.daily_report_client_name = { contains: query.client_name, mode: 'insensitive' };
    if (query.client_contract_no) where.daily_report_client_contract_no = { contains: query.client_contract_no, mode: 'insensitive' };
    if (query.date_from || query.date_to) {
      where.daily_report_date = {};
      if (query.date_from) where.daily_report_date.gte = new Date(query.date_from);
      if (query.date_to) where.daily_report_date.lte = new Date(query.date_to);
    }
    if (query.search) {
      where.OR = [
        { daily_report_work_summary: { contains: query.search, mode: 'insensitive' } },
        { daily_report_project_name: { contains: query.search, mode: 'insensitive' } },
        { daily_report_project_location: { contains: query.search, mode: 'insensitive' } },
        { daily_report_client_name: { contains: query.search, mode: 'insensitive' } },
        { daily_report_client_contract_no: { contains: query.search, mode: 'insensitive' } },
        { project: { project_name: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    this.applyColumnFilters(where, query, excludeColumnFilter);
    return where;
  }

  async findAll(query: any) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const where = this.buildDailyReportWhere(query);

    // Relation sort fields — dir injected per entry to support multi-sort
    const relationSortMap: Record<string, (dir: 'asc' | 'desc') => any> = {
      project: (dir) => ({ project: { project_name: dir } }),
      client: (dir) => ({ client: { name: dir } }),
      creator: (dir) => ({ creator: { displayName: dir } }),
    };

    // ── Resolve sort list ─────────────────────────────────
    // New format: sorts = [{ field, order }, ...] (array or JSON string)
    // Legacy format: sortBy + sortOrder single strings (backward compatible)
    type SortEntry = { field: string; order: string };
    let sortList: SortEntry[] = [];
    let sortsKeyProvided = false;
    const rawSorts = query.sorts;
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
      // Legacy client — fall back to sortBy/sortOrder
      const legacyField =
        typeof query.sortBy === 'string' && query.sortBy
          ? query.sortBy
          : 'daily_report_date';
      const legacyOrder =
        typeof query.sortOrder === 'string' && query.sortOrder
          ? query.sortOrder
          : 'DESC';
      sortList = [{ field: legacyField, order: legacyOrder }];
    }

    const orderByArray: any[] = [];
    const seenFields = new Set<string>();
    for (const { field, order } of sortList) {
      if (seenFields.has(field)) continue;
      const dir: 'asc' | 'desc' =
        String(order).toUpperCase() === 'ASC' ? 'asc' : 'desc';
      if (relationSortMap[field]) {
        orderByArray.push(relationSortMap[field](dir));
        seenFields.add(field);
      } else if (this.allowedSortFields.includes(field)) {
        orderByArray.push({ [field]: dir });
        seenFields.add(field);
      }
      // Unknown fields silently skipped
    }
    if (!orderByArray.length) {
      orderByArray.push({ daily_report_date: 'desc' });
    }
    // Stable tiebreaker
    if (!seenFields.has('id')) {
      orderByArray.push({ id: 'desc' });
    }

    const [data, total] = await Promise.all([
      this.prisma.dailyReport.findMany({
        where,
        include: this.includeAll,
        orderBy: orderByArray,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.dailyReport.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  /**
   * Distinct values of a column for the column-header filter dropdown.
   * Applies all other filters but excludes the target column's own filter.
   */
  async getFilterOptions(column: string, query: any = {}): Promise<string[]> {
    if (!this.columnFilterFields.includes(column)) return [];

    const where = this.buildDailyReportWhere(query, column);

    const relation = this.relationFilterConfig[column];
    if (relation) {
      const rows = await this.prisma.dailyReport.findMany({
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
      const existing =
        where[column] && typeof where[column] === 'object' ? where[column] : {};
      const merged = { ...existing, not: null };
      const rows = await this.prisma.dailyReport.findMany({
        where: { ...where, [column]: merged },
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
              // DATE column — use UTC date string directly.
              return val instanceof Date
                ? val.toISOString().split('T')[0]
                : String(val).split('T')[0];
            })
            .filter(Boolean),
        ),
      ).slice(0, 500);
    }

    const rows = await this.prisma.dailyReport.findMany({
      where,
      select: { [column]: true } as any,
      distinct: [column as any],
      take: 500,
    });
    return Array.from(
      new Set(rows.map((row: any) => {
        const val = row[column];
        return val === null || val === undefined || val === ''
          ? '(空白)'
          : String(val);
      })),
    ).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
  }

  async findOne(id: number) {
    const report = await this.prisma.dailyReport.findUnique({
      where: { id },
      include: this.includeAll,
    });
    if (!report) throw new NotFoundException('日報不存在');
    return report;
  }

  private buildItemData(item: any, idx: number) {
    return {
      daily_report_item_category: item.category,
      daily_report_item_content: item.content || '',
      daily_report_item_quantity: item.quantity ? Number(item.quantity) : null,
      daily_report_item_ot_hours: item.ot_hours ? Number(item.ot_hours) : null,
      daily_report_item_name_or_plate: item.name_or_plate || null,
      daily_report_item_sort_order: idx,
      daily_report_item_worker_type: item.worker_type || null,
      daily_report_item_with_operator: item.with_operator ?? false,
      daily_report_item_employee_ids: item.employee_ids ? (typeof item.employee_ids === 'string' ? item.employee_ids : JSON.stringify(item.employee_ids)) : null,
      daily_report_item_vehicle_ids: item.vehicle_ids ? (typeof item.vehicle_ids === 'string' ? item.vehicle_ids : JSON.stringify(item.vehicle_ids)) : null,
      daily_report_item_shift_quantity: item.shift_quantity ? Number(item.shift_quantity) : null,
      daily_report_item_machine_type: item.machine_type || null,
      daily_report_item_tonnage: item.tonnage ? Number(item.tonnage) : null,
    };
  }

  private buildReportData(rd: any, userId: number) {
    return {
      daily_report_project_id: rd.project_id ? Number(rd.project_id) : null,
      daily_report_date: new Date(rd.report_date),
      daily_report_shift_type: rd.shift_type,
      daily_report_work_summary: rd.work_summary || '',
      daily_report_memo: rd.memo || null,
      daily_report_created_by: userId,
      daily_report_status: rd.status || 'draft',
      daily_report_submitted_at: rd.status === 'submitted' ? new Date() : null,
      daily_report_client_id: rd.client_id ? Number(rd.client_id) : null,
      daily_report_client_name: rd.client_name || null,
      daily_report_client_contract_no: rd.client_contract_no || null,
      daily_report_project_name: rd.project_name || null,
      daily_report_project_location: rd.project_location || null,
      daily_report_completed_work: rd.completed_work || null,
      daily_report_signature: rd.signature || null,
    };
  }

  async create(userId: number, dto: any) {
    const { items, attachments, ...rd } = dto;
    const report = await this.prisma.dailyReport.create({
      data: {
        ...this.buildReportData(rd, userId),
        items: items?.length ? {
          create: items.map((item: any, idx: number) => this.buildItemData(item, idx)),
        } : undefined,
        attachments: attachments?.length ? {
          create: attachments.map((a: any, idx: number) => ({
            daily_report_attachment_file_name: a.file_name,
            daily_report_attachment_file_url: a.file_url,
            daily_report_attachment_file_type: a.file_type,
            daily_report_attachment_sort_order: idx,
          })),
        } : undefined,
      },
      include: this.includeAll,
    });

    // 觸發日報核對
    this.dailyReportVerificationService.verifyByDailyReport(report.id).catch(() => {});

    return report;
  }

  async update(id: number, userId: number, dto: any, adminOverride = false) {
    const existing = await this.prisma.dailyReport.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('日報不存在');
    if (existing.daily_report_status === 'submitted' && !adminOverride) {
      throw new BadRequestException('已提交的日報不可修改');
    }

    const { items, attachments, ...rd } = dto;

    await this.prisma.dailyReportItem.deleteMany({ where: { daily_report_item_report_id: id } });
    await this.prisma.dailyReportAttachment.deleteMany({ where: { daily_report_attachment_report_id: id } });

    const data: any = {
      daily_report_project_id: rd.project_id ? Number(rd.project_id) : null,
      daily_report_date: new Date(rd.report_date),
      daily_report_shift_type: rd.shift_type,
      daily_report_work_summary: rd.work_summary || '',
      daily_report_memo: rd.memo || null,
      daily_report_status: rd.status || 'draft',
      daily_report_submitted_at: rd.status === 'submitted' ? new Date() : null,
      daily_report_client_id: rd.client_id ? Number(rd.client_id) : null,
      daily_report_client_name: rd.client_name || null,
      daily_report_client_contract_no: rd.client_contract_no || null,
      daily_report_project_name: rd.project_name || null,
      daily_report_project_location: rd.project_location || null,
      daily_report_completed_work: rd.completed_work || null,
      daily_report_signature: rd.signature || null,
      daily_report_quotation_id: rd.quotation_id ? Number(rd.quotation_id) : null,
    };

    if (items?.length) {
      data.items = { create: items.map((item: any, idx: number) => this.buildItemData(item, idx)) };
    }

    if (attachments?.length) {
      data.attachments = {
        create: attachments.map((a: any, idx: number) => ({
          daily_report_attachment_file_name: a.file_name,
          daily_report_attachment_file_url: a.file_url,
          daily_report_attachment_file_type: a.file_type,
          daily_report_attachment_sort_order: idx,
        })),
      };
    }

    const report = await this.prisma.dailyReport.update({
      where: { id },
      data,
      include: this.includeAll,
    });

    // 觸發日報核對
    this.dailyReportVerificationService.verifyByDailyReport(report.id).catch(() => {});

    return report;
  }

  // ── Batch update selected fields for multiple reports ──────────
  async batchUpdate(dto: any) {
    const ids: number[] = Array.isArray(dto?.ids) ? dto.ids.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n)) : [];
    if (ids.length === 0) throw new BadRequestException('未選擇任何日報');

    const data: any = {};
    // Only touch fields explicitly provided (non-undefined)
    if (dto.project_id !== undefined) {
      data.daily_report_project_id = dto.project_id === null || dto.project_id === '' ? null : Number(dto.project_id);
    }
    if (dto.project_name !== undefined) {
      data.daily_report_project_name = dto.project_name || null;
    }
    if (dto.project_location !== undefined) {
      data.daily_report_project_location = dto.project_location || null;
    }
    if (dto.client_id !== undefined) {
      data.daily_report_client_id = dto.client_id === null || dto.client_id === '' ? null : Number(dto.client_id);
    }
    if (dto.client_name !== undefined) {
      data.daily_report_client_name = dto.client_name || null;
    }
    if (dto.client_contract_no !== undefined) {
      data.daily_report_client_contract_no = dto.client_contract_no || null;
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('未提供任何需修改的欄位');
    }

    const result = await this.prisma.dailyReport.updateMany({
      where: { id: { in: ids } },
      data,
    });
    return { updated: result.count, ids };
  }

  // ── Add attachments (works even after submission) ───────────────
  async addAttachments(id: number, userId: number, attachments: { file_name: string; file_url: string; file_type: string }[]) {
    const existing = await this.prisma.dailyReport.findUnique({
      where: { id },
      include: { attachments: true },
    });
    if (!existing) throw new NotFoundException('日報不存在');

    const startOrder = existing.attachments.length;
    await this.prisma.dailyReportAttachment.createMany({
      data: attachments.map((a, idx) => ({
        daily_report_attachment_report_id: id,
        daily_report_attachment_file_name: a.file_name,
        daily_report_attachment_file_url: a.file_url,
        daily_report_attachment_file_type: a.file_type,
        daily_report_attachment_sort_order: startOrder + idx,
      })),
    });

    return this.findOne(id);
  }

  // ── Remove single attachment ────────────────────────────────────
  async removeAttachment(reportId: number, attachmentId: number, userId: number) {
    const existing = await this.prisma.dailyReport.findUnique({ where: { id: reportId } });
    if (!existing) throw new NotFoundException('日報不存在');

    await this.prisma.dailyReportAttachment.delete({ where: { id: attachmentId } });
    return this.findOne(reportId);
  }

  async remove(id: number, userId?: number) {
    const existing = await this.prisma.dailyReport.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('日報不存在');
    if (existing.daily_report_status === 'submitted') {
      throw new BadRequestException('已提交的日報不可刪除');
    }
    await this.prisma.dailyReport.update({ where: { id }, data: { daily_report_deleted_at: new Date(), daily_report_deleted_by: userId ?? null } });
    return { success: true };
  }

  async getDistinctProjectNames(): Promise<string[]> {
    const rows = await this.prisma.dailyReport.findMany({
      where: {
        daily_report_deleted_at: null,
        daily_report_project_id: null,
        daily_report_project_name: { not: null },
      },
      select: { daily_report_project_name: true },
      distinct: ['daily_report_project_name'],
      orderBy: { daily_report_project_name: 'asc' },
    });

    const names = rows
      .map((r) => r.daily_report_project_name?.trim())
      .filter((name): name is string => Boolean(name));

    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b, 'zh-HK'));
  }

  async findByProject(projectId: number, query?: any) {
    const page = Number(query?.page) || 1;
    const limit = Number(query?.limit) || 50;
    const where: any = { daily_report_project_id: projectId, daily_report_deleted_at: null };

    const [data, total] = await Promise.all([
      this.prisma.dailyReport.findMany({
        where,
        include: {
          creator: { select: { id: true, displayName: true } },
          items: { orderBy: { daily_report_item_sort_order: 'asc' } },
          attachments: { orderBy: { daily_report_attachment_sort_order: 'asc' } },
        },
        orderBy: { daily_report_date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.dailyReport.count({ where }),
    ]);
    return { data, total, page, limit };
  }
}
