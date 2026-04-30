import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SalaryConfigService {
  constructor(private readonly prisma: PrismaService, private readonly auditLogsService: AuditLogsService) {}

  private readonly allowedSortFields = [
    'id', 'employee_id', 'effective_date', 'base_salary', 'salary_type', 'created_at', 'emp_code',
  ];

  async findAll(query: {
    page?: number; limit?: number; search?: string;
    employee_id?: number; salary_type?: string; is_piece_rate?: string;
    employee_status?: string; role?: string;
    sortBy?: string; sortOrder?: string;
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.employee_id) where.employee_id = Number(query.employee_id);
    if (query.salary_type) where.salary_type = query.salary_type;
    if (query.is_piece_rate === 'true') where.is_piece_rate = true;
    if (query.is_piece_rate === 'false') where.is_piece_rate = false;
    // Always filter out soft-deleted employees
    where.employee = { ...where.employee, deleted_at: null };
    if (query.employee_status) {
      where.employee = { ...where.employee, status: query.employee_status };
    }
    if (query.role) {
      where.employee = { ...where.employee, role: query.role };
    }
    if (query.search) {
      where.employee = {
        ...where.employee,
        OR: [
          { name_zh: { contains: query.search, mode: 'insensitive' } },
          { name_en: { contains: query.search, mode: 'insensitive' } },
          { emp_code: { contains: query.search, mode: 'insensitive' } },
        ],
      };
    }

    const sortBy = this.allowedSortFields.includes(query.sortBy || '') ? query.sortBy! : 'emp_code';
    const sortOrder = (query.sortOrder?.toUpperCase() === 'ASC' ? 'asc' : 'desc') as 'asc' | 'desc';

    // emp_code is on the related employee table, requires nested orderBy
    const orderBy: any = sortBy === 'emp_code'
      ? { employee: { emp_code: sortOrder } }
      : { [sortBy]: sortOrder };

    const [data, total] = await Promise.all([
      this.prisma.employeeSalarySetting.findMany({
        where,
        include: { employee: { include: { company: true } } },
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.employeeSalarySetting.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number) {
    const ss = await this.prisma.employeeSalarySetting.findUnique({
      where: { id },
      include: { employee: { include: { company: true } } },
    });
    if (!ss) throw new NotFoundException('薪酬設定不存在');
    return ss;
  }

  async findByEmployee(employeeId: number) {
    return this.prisma.employeeSalarySetting.findMany({
      where: { employee_id: employeeId },
      orderBy: { effective_date: 'desc' },
    });
  }

  async create(dto: any, userId?: number, ipAddress?: string) {
    // Ensure numeric fields
    const numericFields = [
      'base_salary', 'allowance_night', 'allowance_rent', 'allowance_3runway',
      'ot_rate_standard', 'allowance_well', 'allowance_machine', 'allowance_roller',
      'allowance_crane', 'allowance_move_machine', 'allowance_kwh_night',
      'allowance_mid_shift', 'ot_1800_1900', 'ot_1900_2000', 'ot_0600_0700',
      'ot_0700_0800', 'ot_mid_shift', 'change_amount',
    ];
    for (const field of numericFields) {
      if (dto[field] !== undefined) {
        dto[field] = Number(dto[field]) || 0;
      }
    }

    const saved = await this.prisma.employeeSalarySetting.create({ data: dto });
    if (userId) {
      try {
        await this.auditLogsService.log({
          userId,
          action: 'create',
          targetTable: 'employee_salary_settings',
          targetId: saved.id,
          changesAfter: saved,
          ipAddress,
        });
      } catch (e) { console.error('Audit log error:', e); }
    }
    return this.findOne(saved.id);
  }

  // Field labels for changed_fields display
  private readonly salaryFieldLabels: Record<string, string> = {
    effective_date: '生效日期',
    salary_type: '薪酬類型',
    base_salary: '底薪',
    allowance_night: '晚間津貼',
    allowance_3runway: '3跑津貼',
    allowance_rent: '租車津貼',
    allowance_well: '落井津貼',
    allowance_machine: '揸機津貼',
    allowance_roller: '火輆津貼',
    allowance_crane: '吊/夾車津貼',
    allowance_move_machine: '搬機津貼',
    allowance_kwh_night: '嘉華-夜間津貼',
    allowance_mid_shift: '中直津貼',
    ot_1800_1900: 'OT 1800-1900',
    ot_1900_2000: 'OT 1900-2000',
    ot_0600_0700: 'OT 0600-0700',
    ot_0700_0800: 'OT 0700-0800',
    ot_rate_standard: '標準OT時薪',
    ot_mid_shift: '中直OT津貼',
    mid_shift_ot_allowance: '中直OT津貼(額外)',
    is_piece_rate: '按件計酬',
    fleet_rate_card_id: '車隊費率卡',
    custom_allowances: '自定義津貼',
  };

  async update(id: number, dto: any, userId?: number, ipAddress?: string) {
    const existing = await this.prisma.employeeSalarySetting.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('薪酬設定不存在');

    const { employee, created_at, id: _id, ...updateData } = dto;

    // Convert effective_date string to Date object for Prisma
    if (updateData.effective_date !== undefined && updateData.effective_date !== null) {
      const parsed = new Date(updateData.effective_date);
      if (isNaN(parsed.getTime())) {
        throw new BadRequestException('effective_date 格式無效，請使用 YYYY-MM-DD 格式');
      }
      updateData.effective_date = parsed;
    }

    const numericFields = [
      'base_salary', 'allowance_night', 'allowance_rent', 'allowance_3runway',
      'ot_rate_standard', 'allowance_well', 'allowance_machine', 'allowance_roller',
      'allowance_crane', 'allowance_move_machine', 'allowance_kwh_night',
      'allowance_mid_shift', 'ot_1800_1900', 'ot_1900_2000', 'ot_0600_0700',
      'ot_0700_0800', 'ot_mid_shift', 'change_amount', 'mid_shift_ot_allowance',
    ];
    for (const field of numericFields) {
      if (updateData[field] !== undefined) {
        updateData[field] = Number(updateData[field]) || 0;
      }
    }

    // Compute changed_fields: compare existing vs incoming for tracked fields
    const trackedFields = [
      'effective_date', 'salary_type', 'base_salary',
      'allowance_night', 'allowance_3runway', 'allowance_rent', 'allowance_well',
      'allowance_machine', 'allowance_roller', 'allowance_crane', 'allowance_move_machine',
      'allowance_kwh_night', 'allowance_mid_shift',
      'ot_1800_1900', 'ot_1900_2000', 'ot_0600_0700', 'ot_0700_0800',
      'ot_rate_standard', 'ot_mid_shift', 'mid_shift_ot_allowance',
      'is_piece_rate', 'fleet_rate_card_id',
    ];
    const changedFields: Record<string, { before: any; after: any; label: string }> = {};
    for (const field of trackedFields) {
      if (updateData[field] === undefined) continue;
      const before = (existing as any)[field];
      const after = updateData[field];
      // Normalize for comparison: Decimal -> number, Date -> date string
      const normBefore = before instanceof Date
        ? before.toISOString().slice(0, 10)
        : (before !== null && before !== undefined ? Number(before) : before);
      const normAfter = after instanceof Date
        ? after.toISOString().slice(0, 10)
        : (typeof after === 'string' && field === 'effective_date'
          ? new Date(after).toISOString().slice(0, 10)
          : (after !== null && after !== undefined ? (typeof after === 'boolean' ? after : Number(after)) : after));
      if (String(normBefore) !== String(normAfter)) {
        changedFields[field] = {
          label: this.salaryFieldLabels[field] || field,
          before: normBefore,
          after: normAfter,
        };
      }
    }
    // Also track custom_allowances changes
    if (updateData.custom_allowances !== undefined) {
      const beforeJson = JSON.stringify(existing.custom_allowances || []);
      const afterJson = JSON.stringify(updateData.custom_allowances || []);
      if (beforeJson !== afterJson) {
        changedFields['custom_allowances'] = {
          label: '自定義津貼',
          before: existing.custom_allowances,
          after: updateData.custom_allowances,
        };
      }
    }
    if (Object.keys(changedFields).length > 0) {
      updateData.changed_fields = changedFields;
    }

    const updated = await this.prisma.employeeSalarySetting.update({ where: { id }, data: updateData });
    if (userId) {
      try {
        await this.auditLogsService.log({
          userId,
          action: 'update',
          targetTable: 'employee_salary_settings',
          targetId: id,
          changesBefore: existing,
          changesAfter: updated,
          ipAddress,
        });
      } catch (e) { console.error('Audit log error:', e); }
    }
    return this.findOne(id);
  }

  async delete(id: number, userId?: number, ipAddress?: string) {
    const existing = await this.prisma.employeeSalarySetting.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('薪酬設定不存在');
    if (userId) {
      try {
        await this.auditLogsService.log({
          userId,
          action: 'delete',
          targetTable: 'employee_salary_settings',
          targetId: id,
          changesBefore: existing,
          ipAddress,
        });
      } catch (e) { console.error('Audit log error:', e); }
    }
    await this.prisma.employeeSalarySetting.delete({ where: { id } });
    return { deleted: true };
  }
}
