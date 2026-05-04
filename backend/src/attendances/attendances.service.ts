import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';

interface AttendanceListQuery {
  page?: number | string;
  limit?: number | string;
  search?: string;
  employee_id?: number | string;
  date_from?: string;
  date_to?: string;
  type?: string;
  sortBy?: string;
  sortOrder?: string;
  [key: string]: string | number | undefined;
}

type ColumnFilters = Record<string, string[]>;

const TYPE_LABEL_TO_VALUE: Record<string, string> = {
  開工: 'clock_in',
  收工: 'clock_out',
  clock_in: 'clock_in',
  clock_out: 'clock_out',
};

const TYPE_VALUE_TO_LABEL: Record<string, string> = {
  clock_in: '開工',
  clock_out: '收工',
};

@Injectable()
export class AttendancesService {
  constructor(private prisma: PrismaService) {}

  private parseColumnFilters(query: AttendanceListQuery): ColumnFilters {
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
    const match = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) return null;
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    if (!day || !month || !year) return null;
    const start = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    const end = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0, 0));
    return { start, end };
  }

  private formatDisplayDate(date: Date): string {
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const year = date.getUTCFullYear();
    return `${day}/${month}/${year}`;
  }

  private buildColumnFilterWhere(filters: ColumnFilters): Prisma.EmployeeAttendanceWhereInput {
    const conditions: Prisma.EmployeeAttendanceWhereInput[] = [];

    for (const [field, values] of Object.entries(filters)) {
      if (field === 'type') {
        const rawValues = values.map((value) => TYPE_LABEL_TO_VALUE[value] || value);
        conditions.push({ type: { in: rawValues } });
      } else if (field === 'employee_name') {
        const hasBlank = values.includes('-');
        const names = values.filter((value) => value !== '-');
        const nameConditions: Prisma.EmployeeAttendanceWhereInput[] = [];
        if (names.length > 0) {
          nameConditions.push({
            employee: {
              OR: [{ name_zh: { in: names } }, { name_en: { in: names } }],
            },
          });
        }
        if (nameConditions.length === 1) conditions.push(nameConditions[0]);
        if (nameConditions.length > 1) conditions.push({ OR: nameConditions });
      } else if (field === 'role') {
        const hasBlank = values.includes('-');
        const roles = values.filter((value) => value !== '-');
        const roleConditions: Prisma.EmployeeAttendanceWhereInput[] = [];
        if (roles.length > 0) roleConditions.push({ employee: { role: { in: roles } } });
        if (hasBlank) roleConditions.push({ employee: { role: '' } });
        if (roleConditions.length === 1) conditions.push(roleConditions[0]);
        if (roleConditions.length > 1) conditions.push({ OR: roleConditions });
      } else if (field === 'emp_code') {
        const hasBlank = values.includes('-');
        const codes = values.filter((value) => value !== '-');
        const codeConditions: Prisma.EmployeeAttendanceWhereInput[] = [];
        if (codes.length > 0) codeConditions.push({ employee: { emp_code: { in: codes } } });
        if (hasBlank) codeConditions.push({ employee: { emp_code: null } });
        if (codeConditions.length === 1) conditions.push(codeConditions[0]);
        if (codeConditions.length > 1) conditions.push({ OR: codeConditions });
      } else if (field === 'date') {
        const dateRanges = values
          .map((value) => this.parseDisplayDate(value))
          .filter((range): range is { start: Date; end: Date } => range !== null);
        if (dateRanges.length > 0) {
          conditions.push({
            OR: dateRanges.map((range) => ({
              timestamp: { gte: range.start, lt: range.end },
            })),
          });
        }
      } else if (field === 'is_mid_shift') {
        const booleanValues: boolean[] = [];
        if (values.includes('是') || values.includes('true')) booleanValues.push(true);
        if (values.includes('否') || values.includes('false')) booleanValues.push(false);
        if (booleanValues.length === 1) conditions.push({ is_mid_shift: booleanValues[0] });
      }
    }

    return conditions.length > 0 ? { AND: conditions } : {};
  }

  private buildBaseWhere(query: AttendanceListQuery): Prisma.EmployeeAttendanceWhereInput {
    const where: Prisma.EmployeeAttendanceWhereInput = {};

    if (query.employee_id) where.employee_id = Number(query.employee_id);
    if (query.type) where.type = query.type;

    if (query.date_from || query.date_to) {
      where.timestamp = {};
      if (query.date_from) where.timestamp.gte = new Date(query.date_from);
      if (query.date_to) {
        const end = new Date(query.date_to);
        end.setHours(23, 59, 59, 999);
        where.timestamp.lte = end;
      }
    }

    if (query.search) {
      where.OR = [
        { employee: { name_zh: { contains: query.search, mode: 'insensitive' } } },
        { employee: { name_en: { contains: query.search, mode: 'insensitive' } } },
        { employee: { emp_code: { contains: query.search, mode: 'insensitive' } } },
        { address: { contains: query.search, mode: 'insensitive' } },
        { remarks: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const columnFilterWhere = this.buildColumnFilterWhere(this.parseColumnFilters(query));
    if (columnFilterWhere.AND) where.AND = columnFilterWhere.AND;

    return where;
  }

  private buildOrderBy(sortBy: string | undefined, sortOrder: Prisma.SortOrder): Prisma.EmployeeAttendanceOrderByWithRelationInput {
    if (sortBy === 'emp_code') return { employee: { emp_code: sortOrder } };
    if (sortBy === 'employee_name') return { employee: { name_zh: sortOrder } };
    if (sortBy === 'role') return { employee: { role: sortOrder } };
    if (sortBy === 'date' || sortBy === 'time' || sortBy === 'timestamp') return { timestamp: sortOrder };
    if (sortBy === 'type') return { type: sortOrder };
    if (sortBy === 'created_at') return { created_at: sortOrder };
    if (sortBy === 'id') return { id: sortOrder };
    return { timestamp: 'desc' };
  }

  async findAll(query: AttendanceListQuery) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const where = this.buildBaseWhere(query);
    const sortOrder: Prisma.SortOrder = query.sortOrder?.toUpperCase() === 'ASC' ? 'asc' : 'desc';
    const orderBy = this.buildOrderBy(query.sortBy, sortOrder);

    const [data, total] = await Promise.all([
      this.prisma.employeeAttendance.findMany({
        where,
        include: {
          employee: {
            select: { id: true, name_zh: true, name_en: true, emp_code: true, role: true, employee_is_temporary: true },
          },
          mid_shift_approver: {
            select: { id: true, name_zh: true },
          },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.employeeAttendance.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getFilterOptions(column: string, query: AttendanceListQuery): Promise<string[]> {
    const where = this.buildBaseWhere(query);
    const columnFilters = this.parseColumnFilters(query);
    delete columnFilters[column];
    const columnFilterWhere = this.buildColumnFilterWhere(columnFilters);
    if (columnFilterWhere.AND) where.AND = columnFilterWhere.AND;
    else delete where.AND;

    if (column === 'type') {
      const results = await this.prisma.employeeAttendance.findMany({
        where,
        select: { type: true },
        distinct: ['type'],
        orderBy: { type: 'asc' },
      });
      return results
        .map((record) => TYPE_VALUE_TO_LABEL[record.type] || record.type || '-')
        .sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    }

    if (column === 'employee_name' || column === 'emp_code' || column === 'role') {
      const records = await this.prisma.employeeAttendance.findMany({
        where,
        include: { employee: { select: { name_zh: true, name_en: true, emp_code: true, role: true } } },
        distinct: ['employee_id'],
      });
      const values = records.map((record) => {
        if (column === 'employee_name') return record.employee?.name_zh || record.employee?.name_en || '-';
        if (column === 'emp_code') return record.employee?.emp_code || '-';
        return record.employee?.role || '-';
      });
      return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    }

    if (column === 'date') {
      const records = await this.prisma.employeeAttendance.findMany({
        where,
        select: { timestamp: true },
        orderBy: { timestamp: 'desc' },
      });
      const values = records.map((record) => this.formatDisplayDate(record.timestamp));
      return [...new Set(values)];
    }

    if (column === 'is_mid_shift') {
      const results = await this.prisma.employeeAttendance.findMany({
        where,
        select: { is_mid_shift: true },
        distinct: ['is_mid_shift'],
      });
      return results.map((record) => (record.is_mid_shift ? '是' : '否'));
    }

    return [];
  }

  async findOne(id: number) {
    const record = await this.prisma.employeeAttendance.findUnique({
      where: { id },
      include: {
        employee: {
          select: { id: true, name_zh: true, name_en: true, emp_code: true, role: true, employee_is_temporary: true },
        },
        mid_shift_approver: {
          select: { id: true, name_zh: true },
        },
      },
    });
    if (!record) throw new NotFoundException('打卡記錄不存在');
    return record;
  }

  async update(id: number, dto: UpdateAttendanceDto) {
    const existing = await this.prisma.employeeAttendance.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('打卡記錄不存在');
    const data: Prisma.EmployeeAttendanceUncheckedUpdateInput = { ...dto };
    if (typeof data.timestamp === 'string') data.timestamp = new Date(data.timestamp);
    if (data.employee_id !== undefined) data.employee_id = Number(data.employee_id);

    return this.prisma.employeeAttendance.update({
      where: { id },
      data,
      include: {
        employee: {
          select: { id: true, name_zh: true, name_en: true, emp_code: true, role: true, employee_is_temporary: true },
        },
      },
    });
  }

  async remove(id: number) {
    const existing = await this.prisma.employeeAttendance.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('打卡記錄不存在');
    await this.prisma.employeeAttendance.delete({ where: { id } });
    return { success: true };
  }
}
