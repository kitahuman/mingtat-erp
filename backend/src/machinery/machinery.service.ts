import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PrismaService } from '../prisma/prisma.service';

interface MachineryListQuery {
  page?: number | string;
  limit?: number | string;
  search?: string;
  machine_type?: string;
  owner_company_id?: number | string;
  status?: string;
  sortBy?: string;
  sortOrder?: string;
  [key: string]: string | number | undefined;
}

type ColumnFilters = Record<string, string[]>;

const STATUS_LABEL_TO_VALUE: Record<string, string> = {
  使用中: 'active',
  維修中: 'maintenance',
  停用: 'inactive',
  active: 'active',
  maintenance: 'maintenance',
  inactive: 'inactive',
};

const STATUS_VALUE_TO_LABEL: Record<string, string> = {
  active: '使用中',
  maintenance: '維修中',
  inactive: '停用',
};

@Injectable()
export class MachineryService {
  constructor(private prisma: PrismaService, private readonly auditLogsService: AuditLogsService) {}

  private parseColumnFilters(query: MachineryListQuery): ColumnFilters {
    const filters: ColumnFilters = {};
    for (const key of Object.keys(query)) {
      if (!key.startsWith('filter_') || !query[key]) continue;
      const field = key.replace('filter_', '');
      const values = String(query[key])
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
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

  private formatDisplayDate(date: Date | null): string {
    if (!date) return '-';
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const year = date.getUTCFullYear();
    return `${day}/${month}/${year}`;
  }

  private formatTonnage(value: any): string {
    if (value == null || value === '') return '-';
    return `${Number(value)}T`;
  }

  private parseTonnage(value: string): number | null {
    if (value === '-') return null;
    const normalized = value.replace(/T$/i, '').trim();
    const numberValue = Number(normalized);
    return Number.isFinite(numberValue) ? numberValue : null;
  }

  private buildColumnFilterWhere(filters: ColumnFilters): Prisma.MachineryWhereInput {
    const conditions: Prisma.MachineryWhereInput[] = [];
    const nullableStringFields = ['brand', 'model', 'serial_number'] as const;
    const directStringFields = ['machine_code', 'machine_type'] as const;

    for (const [field, values] of Object.entries(filters)) {
      if (values.includes('__NO_MATCH__')) {
        conditions.push({ id: -1 });
        continue;
      }

      const hasBlank = values.includes('-');
      const nonBlankValues = values.filter((value) => value !== '-');

      if ((directStringFields as readonly string[]).includes(field)) {
        if (nonBlankValues.length > 0) conditions.push({ [field]: { in: nonBlankValues } } as Prisma.MachineryWhereInput);
      } else if ((nullableStringFields as readonly string[]).includes(field)) {
        const fieldConditions: Prisma.MachineryWhereInput[] = [];
        if (nonBlankValues.length > 0) fieldConditions.push({ [field]: { in: nonBlankValues } } as Prisma.MachineryWhereInput);
        if (hasBlank) fieldConditions.push({ OR: [{ [field]: null }, { [field]: '' }] } as Prisma.MachineryWhereInput);
        if (fieldConditions.length === 1) conditions.push(fieldConditions[0]);
        if (fieldConditions.length > 1) conditions.push({ OR: fieldConditions });
      } else if (field === 'tonnage') {
        const tonnageValues = nonBlankValues
          .map((value) => this.parseTonnage(value))
          .filter((value): value is number => value !== null);
        const tonnageConditions: Prisma.MachineryWhereInput[] = [];
        if (tonnageValues.length > 0) tonnageConditions.push({ tonnage: { in: tonnageValues } });
        if (hasBlank) tonnageConditions.push({ tonnage: null });
        if (tonnageConditions.length === 1) conditions.push(tonnageConditions[0]);
        if (tonnageConditions.length > 1) conditions.push({ OR: tonnageConditions });
      } else if (field === 'owner_company') {
        const companyConditions: Prisma.MachineryWhereInput[] = [];
        if (nonBlankValues.length > 0) {
          companyConditions.push({ owner_company: { internal_prefix: { in: nonBlankValues } } });
        }
        if (hasBlank) {
          companyConditions.push({ owner_company: { OR: [{ internal_prefix: null }, { internal_prefix: '' }] } });
        }
        if (companyConditions.length === 1) conditions.push(companyConditions[0]);
        if (companyConditions.length > 1) conditions.push({ OR: companyConditions });
      } else if (field === 'inspection_cert_expiry' || field === 'insurance_expiry') {
        const dateRanges = nonBlankValues
          .map((value) => this.parseDisplayDate(value))
          .filter((range): range is { start: Date; end: Date } => range !== null);
        const dateConditions: Prisma.MachineryWhereInput[] = [];
        if (dateRanges.length > 0) {
          dateConditions.push({
            OR: dateRanges.map((range) => ({ [field]: { gte: range.start, lt: range.end } }) as Prisma.MachineryWhereInput),
          });
        }
        if (hasBlank) dateConditions.push({ [field]: null } as Prisma.MachineryWhereInput);
        if (dateConditions.length === 1) conditions.push(dateConditions[0]);
        if (dateConditions.length > 1) conditions.push({ OR: dateConditions });
      } else if (field === 'status') {
        const rawValues = nonBlankValues.map((value) => STATUS_LABEL_TO_VALUE[value] || value);
        if (rawValues.length > 0) conditions.push({ status: { in: rawValues } });
      }
    }

    return conditions.length > 0 ? { AND: conditions } : {};
  }

  private buildBaseWhere(query: MachineryListQuery, excludeFilterColumn?: string): Prisma.MachineryWhereInput {
    const where: Prisma.MachineryWhereInput = { deleted_at: null };

    if (query.machine_type) where.machine_type = query.machine_type;
    if (query.owner_company_id) where.owner_company_id = Number(query.owner_company_id);
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { machine_code: { contains: query.search, mode: 'insensitive' } },
        { brand: { contains: query.search, mode: 'insensitive' } },
        { model: { contains: query.search, mode: 'insensitive' } },
        { serial_number: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const columnFilters = this.parseColumnFilters(query);
    if (excludeFilterColumn) delete columnFilters[excludeFilterColumn];
    const columnFilterWhere = this.buildColumnFilterWhere(columnFilters);
    if (columnFilterWhere.AND) where.AND = columnFilterWhere.AND;

    return where;
  }

  private buildOrderBy(sortBy: string | undefined, sortOrder: Prisma.SortOrder): Prisma.MachineryOrderByWithRelationInput {
    const directSortFields = [
      'machine_code', 'machine_type', 'brand', 'model', 'tonnage', 'serial_number',
      'inspection_cert_expiry', 'insurance_expiry', 'status', 'id', 'created_at',
    ];
    if (sortBy === 'owner_company') return { owner_company: { internal_prefix: sortOrder } };
    if (directSortFields.includes(sortBy || '')) return { [sortBy!]: sortOrder } as Prisma.MachineryOrderByWithRelationInput;
    return { machine_code: 'asc' };
  }

  async simple() {
    const machines = await this.prisma.machinery.findMany({
      where: { status: 'active' },
      select: { id: true, machine_code: true, machine_type: true, tonnage: true },
      orderBy: { machine_code: 'asc' },
    });
    return machines.map(m => ({
      value: m.machine_code,
      label: m.machine_code,
      type: m.machine_type,
      tonnage: m.tonnage ? String(m.tonnage) : null,
      category: 'machinery',
    }));
  }

  async findAll(query: MachineryListQuery) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const where = this.buildBaseWhere(query);
    const sortOrder: Prisma.SortOrder = query.sortOrder?.toUpperCase() === 'DESC' ? 'desc' : 'asc';
    const orderBy = this.buildOrderBy(query.sortBy, sortOrder);

    const [data, total] = await Promise.all([
      this.prisma.machinery.findMany({
        where,
        include: { owner_company: true },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.machinery.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getFilterOptions(column: string, query: MachineryListQuery): Promise<string[]> {
    const where = this.buildBaseWhere(query, column);
    const stringColumns = ['machine_code', 'machine_type', 'brand', 'model', 'serial_number', 'status'] as const;
    const dateColumns = ['inspection_cert_expiry', 'insurance_expiry'] as const;

    if ((stringColumns as readonly string[]).includes(column)) {
      const records = await this.prisma.machinery.findMany({
        where,
        select: { [column]: true } as any,
        distinct: [column as any],
        orderBy: { [column]: 'asc' } as any,
      });
      const values = records.map((record: any) => {
        const value = record[column];
        if (column === 'status') return STATUS_VALUE_TO_LABEL[value] || value || '-';
        return value || '-';
      });
      return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    }

    if (column === 'tonnage') {
      const records = await this.prisma.machinery.findMany({
        where,
        select: { tonnage: true },
        distinct: ['tonnage'],
        orderBy: { tonnage: 'asc' },
      });
      return records.map((record) => this.formatTonnage(record.tonnage));
    }

    if (column === 'owner_company') {
      const records = await this.prisma.machinery.findMany({
        where,
        include: { owner_company: { select: { internal_prefix: true } } },
        distinct: ['owner_company_id'],
      });
      const values = records.map((record) => record.owner_company?.internal_prefix || '-');
      return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    }

    if ((dateColumns as readonly string[]).includes(column)) {
      const records = await this.prisma.machinery.findMany({
        where,
        select: { [column]: true } as any,
        orderBy: { [column]: 'desc' } as any,
      });
      const values = records.map((record: any) => this.formatDisplayDate(record[column]));
      return [...new Set(values)];
    }

    return [];
  }

  async findOne(id: number) {
    const m = await this.prisma.machinery.findUnique({
      where: { id },
      include: {
        owner_company: true,
        transfers: {
          include: { from_company: true, to_company: true },
          orderBy: { transfer_date: 'desc' },
        },
      },
    });
    if (!m) throw new NotFoundException('機械不存在');
    return m;
  }

  async create(dto: any, userId?: number, ipAddress?: string) {
    const { owner_company, transfers, ...data } = dto;
    const saved = await this.prisma.machinery.create({ data });
    if (userId) {
      try {
        await this.auditLogsService.log({
          userId,
          action: 'create',
          targetTable: 'machinery',
          targetId: saved.id,
          changesAfter: saved,
          ipAddress,
        });
      } catch (e) { console.error('Audit log error:', e); }
    }
    return this.findOne(saved.id);
  }

  async update(id: number, dto: any, userId?: number, ipAddress?: string) {
    const existing = await this.prisma.machinery.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('機械不存在');
    const { transfers, owner_company, created_at, updated_at, id: _id, ...updateData } = dto;

    // 日期欄位：字串轉 Date，空值轉 null
    const dateFields = ['inspection_cert_expiry', 'insurance_expiry'];
    for (const field of dateFields) {
      if (field in updateData) {
        updateData[field] = updateData[field] ? new Date(updateData[field]) : null;
      }
    }
    // tonnage: 轉數字
    if ('tonnage' in updateData) {
      updateData.tonnage = updateData.tonnage != null && updateData.tonnage !== '' ? Number(updateData.tonnage) : null;
    }

    const updated = await this.prisma.machinery.update({ where: { id }, data: updateData });
    if (userId) {
      try {
        await this.auditLogsService.log({
          userId,
          action: 'update',
          targetTable: 'machinery',
          targetId: id,
          changesBefore: existing,
          changesAfter: updated,
          ipAddress,
        });
      } catch (e) { console.error('Audit log error:', e); }
    }
    return this.findOne(id);
  }

  async transferMachinery(id: number, dto: { from_company_id: number; to_company_id: number; transfer_date: string; notes?: string }) {
    await this.prisma.machineryTransfer.create({
      data: {
        machinery_id: id,
        from_company_id: dto.from_company_id,
        to_company_id: dto.to_company_id,
        transfer_date: new Date(dto.transfer_date),
        notes: dto.notes,
      },
    });
    await this.prisma.machinery.update({
      where: { id },
      data: { owner_company_id: dto.to_company_id },
    });
    return this.findOne(id);
  }

  async remove(id: number, userId?: number, ipAddress?: string) {
    const existing = await this.prisma.machinery.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('機械不存在');
    if (userId) {
      try {
        await this.auditLogsService.log({
          userId,
          action: 'delete',
          targetTable: 'machinery',
          targetId: id,
          changesBefore: existing,
          ipAddress,
        });
      } catch (e) { console.error('Audit log error:', e); }
    }
    await this.prisma.machinery.update({ where: { id }, data: { deleted_at: new Date(), deleted_by: userId ?? null } });
    return { message: '刪除成功' };
  }

}
