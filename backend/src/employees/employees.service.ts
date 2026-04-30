import {
  Injectable,
  NotFoundException,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PrismaService } from '../prisma/prisma.service';
import { OrderByClause, WhereClause } from '../common/types';

@Injectable()
export class EmployeesService {
  constructor(
    private prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  /**
   * Generate the next available emp_code in format E001, E002, ...
   * Uses gap-filling strategy: finds the smallest positive integer N
   * such that E{N} is not currently assigned to any employee.
   * This ensures no gaps are left when employees are deleted.
   */
  private async getNextEmpCode(): Promise<string> {
    const existing = await this.prisma.employee.findMany({
      where: { emp_code: { not: null } },
      select: { emp_code: true },
    });
    const usedNums = new Set<number>();
    for (const emp of existing) {
      if (!emp.emp_code) continue;
      const match = emp.emp_code.match(/^E(\d+)$/);
      if (match) {
        usedNums.add(parseInt(match[1], 10));
      }
    }
    // Find the smallest positive integer not in usedNums
    let nextNum = 1;
    while (usedNums.has(nextNum)) {
      nextNum++;
    }
    return 'E' + String(nextNum).padStart(3, '0');
  }

  /**
   * Public endpoint: returns the next available emp_code (for frontend preview).
   */
  async getNextEmpCodePublic(): Promise<{ next_emp_code: string }> {
    const code = await this.getNextEmpCode();
    return { next_emp_code: code };
  }

  /**
   * Backfill emp_code for regular (non-temporary) employees that are missing one.
   * Assigns codes in order of employee id (oldest first).
   */
  async backfillMissingEmpCodes(): Promise<{ updated: number; codes: string[] }> {
    const missing = await this.prisma.employee.findMany({
      where: {
        employee_is_temporary: false,
        emp_code: null,
        deleted_at: null,
      },
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    if (missing.length === 0) return { updated: 0, codes: [] };
    const codes: string[] = [];
    for (const emp of missing) {
      const code = await this.getNextEmpCode();
      await this.prisma.employee.update({ where: { id: emp.id }, data: { emp_code: code } });
      codes.push(code);
    }
    return { updated: missing.length, codes };
  }

  /**
   * Parse column filter parameters from query.
   * Supports: filter_<field>=value1,value2
   * For relation fields like company, maps to company_id via lookup.
   */
  private parseColumnFilters(
    query: Record<string, any>,
  ): Record<string, string[]> {
    const filters: Record<string, string[]> = {};
    for (const key of Object.keys(query)) {
      if (key.startsWith('filter_') && query[key]) {
        const field = key.replace('filter_', '');
        const values = String(query[key])
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean);
        if (values.length > 0) {
          filters[field] = values;
        }
      }
    }
    return filters;
  }

  /**
   * Build Prisma where conditions from column filters.
   * Handles scalar fields (role, status, emp_code, etc.) and
   * relation fields (company -> company.internal_prefix / company.name).
   */
  private buildColumnFilterWhere(
    filters: Record<string, string[]>,
  ): WhereClause {
    const conditions: WhereClause[] = [];

    // Scalar fields that can be filtered directly with `in`
    const scalarFields = [
      'role',
      'status',
      'emp_code',
      'name_zh',
      'name_en',
      'phone',
      'id_number',
      'termination_reason',
    ];
    // Date fields: filter by formatted date string match (we'll handle these specially)
    const dateFields = [
      'join_date',
      'termination_date',
      'green_card_expiry',
      'construction_card_expiry',
      'driving_license_expiry',
    ];

    for (const [field, values] of Object.entries(filters)) {
      if (field === 'company') {
        // Company is a relation field - filter by company.internal_prefix or company.name
        // Handle the special '-' value meaning null company
        const hasNull = values.includes('-');
        const nonNullValues = values.filter((v) => v !== '-');

        const companyConditions: WhereClause[] = [];
        if (nonNullValues.length > 0) {
          companyConditions.push({
            company: {
              OR: [
                { internal_prefix: { in: nonNullValues } },
                { name: { in: nonNullValues } },
              ],
            },
          });
        }
        if (hasNull) {
          companyConditions.push({ company_id: null });
        }
        if (companyConditions.length === 1) {
          conditions.push(companyConditions[0]);
        } else if (companyConditions.length > 1) {
          conditions.push({ OR: companyConditions });
        }
      } else if (dateFields.includes(field)) {
        // Date fields: the frontend sends formatted date strings like "07/04/2026" or "-"
        // We need to match these against the actual date values
        const hasNull = values.includes('-');
        const dateValues = values.filter((v) => v !== '-');

        const dateConditions: WhereClause[] = [];
        if (dateValues.length > 0) {
          // Parse DD/MM/YYYY format dates to Date ranges
          const dateRanges: WhereClause[] = [];
          for (const dateStr of dateValues) {
            const parsed = this.parseDateFilter(dateStr);
            if (parsed) {
              dateRanges.push({
                [field]: {
                  gte: parsed.start,
                  lt: parsed.end,
                },
              });
            }
          }
          if (dateRanges.length > 0) {
            dateConditions.push({ OR: dateRanges });
          }
        }
        if (hasNull) {
          dateConditions.push({ [field]: null });
        }
        if (dateConditions.length === 1) {
          conditions.push(dateConditions[0]);
        } else if (dateConditions.length > 1) {
          conditions.push({ OR: dateConditions });
        }
      } else if (scalarFields.includes(field)) {
        // Handle '-' as null
        const hasNull = values.includes('-');
        const nonNullValues = values.filter((v) => v !== '-');

        const fieldConditions: WhereClause[] = [];
        if (nonNullValues.length > 0) {
          fieldConditions.push({ [field]: { in: nonNullValues } });
        }
        if (hasNull) {
          fieldConditions.push({ [field]: null });
        }
        if (fieldConditions.length === 1) {
          conditions.push(fieldConditions[0]);
        } else if (fieldConditions.length > 1) {
          conditions.push({ OR: fieldConditions });
        }
      }
      // Unknown fields are silently ignored for safety
    }

    return conditions.length > 0 ? { AND: conditions } : {};
  }

  /**
   * Parse a date string in DD/MM/YYYY format to a day range.
   */
  private parseDateFilter(dateStr: string): { start: Date; end: Date } | null {
    // Try DD/MM/YYYY format
    const match = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match) {
      const day = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1;
      const year = parseInt(match[3], 10);
      const start = new Date(year, month, day);
      const end = new Date(year, month, day + 1);
      return { start, end };
    }
    // Try YYYY-MM-DD format
    const match2 = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (match2) {
      const year = parseInt(match2[1], 10);
      const month = parseInt(match2[2], 10) - 1;
      const day = parseInt(match2[3], 10);
      const start = new Date(year, month, day);
      const end = new Date(year, month, day + 1);
      return { start, end };
    }
    return null;
  }

  async findAll(query: {
    page?: number;
    limit?: number;
    search?: string;
    role?: string;
    company_id?: number;
    status?: string;
    sortBy?: string;
    sortOrder?: string;
    is_temporary?: string;
    [key: string]: any; // Allow filter_* params
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const where: WhereClause = { deleted_at: null };

    if (query.role) where.role = query.role;
    if (query.company_id) where.company_id = Number(query.company_id);
    if (query.status) where.status = query.status;
    if (query.is_temporary === 'true') where.employee_is_temporary = true;
    else if (query.is_temporary === 'false')
      where.employee_is_temporary = false;
    if (query.search) {
      where.OR = [
        { name_zh: { contains: query.search, mode: 'insensitive' } },
        { name_en: { contains: query.search, mode: 'insensitive' } },
        { emp_code: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search, mode: 'insensitive' } },
        { nickname: { contains: query.search, mode: 'insensitive' } },
        { id_number: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    // Parse and apply column filters (filter_role, filter_status, filter_company, etc.)
    const columnFilters = this.parseColumnFilters(query);
    const columnFilterWhere = this.buildColumnFilterWhere(columnFilters);

    // Merge column filter conditions into the main where clause
    if (columnFilterWhere.AND) {
      if (where.AND) {
        where.AND = [...where.AND, ...columnFilterWhere.AND];
      } else {
        where.AND = columnFilterWhere.AND;
      }
    }

    // Handle sort - support relation fields like 'company'
    const allowedSortFields = [
      'emp_code',
      'name_zh',
      'name_en',
      'role',
      'phone',
      'green_card_expiry',
      'construction_card_expiry',
      'driving_license_expiry',
      'status',
      'id',
      'join_date',
      'termination_date',
      'termination_reason',
      'id_number',
      'created_at',
    ];
    const sortOrder =
      query.sortOrder?.toUpperCase() === 'DESC' ? 'desc' : 'asc';
    let orderBy: OrderByClause;

    if (query.sortBy === 'company') {
      // Sort by company.internal_prefix (relation field)
      orderBy = { company: { internal_prefix: sortOrder } };
    } else {
      const sortBy = allowedSortFields.includes(query.sortBy || '')
        ? query.sortBy!
        : 'name_en';
      orderBy = { [sortBy]: sortOrder };
    }

    const [employees, total] = await Promise.all([
      this.prisma.employee.findMany({
        where,
        include: { company: true },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.employee.count({ where }),
    ]);

    // For temporary employees, attach attendance count
    const data = await Promise.all(
      employees.map(async (emp) => {
        if (emp.employee_is_temporary) {
          const attendance_count = await this.prisma.employeeAttendance.count({
            where: { employee_id: emp.id },
          });
          return { ...emp, attendance_count };
        }
        return emp;
      }),
    );

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * Get distinct filter options for a given column.
   * Used by frontend DataTable to populate column filter dropdowns with all possible values,
   * not just the values on the current page.
   */
  async getFilterOptions(
    column: string,
    query: {
      search?: string;
      role?: string;
      company_id?: number;
      status?: string;
      [key: string]: any;
    },
  ) {
    // Build the same base where clause as findAll (excluding the column being filtered)
    const where: WhereClause = { deleted_at: null };
    if (query.role) where.role = query.role;
    if (query.company_id) where.company_id = Number(query.company_id);
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { name_zh: { contains: query.search, mode: 'insensitive' } },
        { name_en: { contains: query.search, mode: 'insensitive' } },
        { emp_code: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search, mode: 'insensitive' } },
        { nickname: { contains: query.search, mode: 'insensitive' } },
        { id_number: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    // Apply other column filters (cross-filter: other active filters should narrow down options)
    const columnFilters = this.parseColumnFilters(query);
    // Remove the current column's own filter so we get all options for it
    delete columnFilters[column];
    const columnFilterWhere = this.buildColumnFilterWhere(columnFilters);
    if (columnFilterWhere.AND) {
      where.AND = columnFilterWhere.AND;
    }

    if (column === 'company') {
      // Get distinct company values via relation
      const employees = await this.prisma.employee.findMany({
        where,
        include: { company: true },
        distinct: ['company_id'],
      });
      const values = employees.map(
        (e) => e.company?.internal_prefix || e.company?.name || '-',
      );
      return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    }

    // For scalar fields, use groupBy or distinct
    const scalarFields = [
      'role',
      'status',
      'emp_code',
      'name_zh',
      'name_en',
      'phone',
      'id_number',
      'join_date',
      'termination_date',
      'green_card_expiry',
      'construction_card_expiry',
      'driving_license_expiry',
      'termination_reason',
    ];

    if (!scalarFields.includes(column)) {
      return [];
    }

    const results = await this.prisma.employee.findMany({
      where,
      select: { [column]: true },
      distinct: [column as any],
      orderBy: { [column]: 'asc' },
    });

    return results.map((r: any) => {
      const val = r[column];
      if (val === null || val === undefined) return '-';
      if (val instanceof Date) {
        // Format as DD/MM/YYYY to match frontend display
        const d = val.getDate().toString().padStart(2, '0');
        const m = (val.getMonth() + 1).toString().padStart(2, '0');
        const y = val.getFullYear();
        return `${d}/${m}/${y}`;
      }
      return String(val);
    });
  }

  async findOne(id: number) {
    const emp = await this.prisma.employee.findUnique({
      where: { id },
      include: {
        company: true,
        salary_settings: { orderBy: { effective_date: 'desc' } },
        transfers: {
          include: { from_company: true, to_company: true },
          orderBy: { transfer_date: 'desc' },
        },
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            phone: true,
            role: true,
            isActive: true,
          },
        },
      },
    });
    if (!emp) throw new NotFoundException('員工不存在');
    return emp;
  }

  async create(dto: any, userId?: number, ipAddress?: string) {
    const { company, salary_settings, transfers, force_create, ...data } = dto;

    // 身份證號碼重複檢查（硬性阻擋）
    if (data.id_number) {
      const existingById = await this.prisma.employee.findFirst({
        where: { id_number: data.id_number },
        select: { id: true, emp_code: true, name_zh: true },
      });
      if (existingById) {
        throw new BadRequestException({
          code: 'DUPLICATE_ID_NUMBER',
          message: `身份證號碼 ${data.id_number} 已被員工 ${existingById.name_zh}（${existingById.emp_code || 'N/A'}）使用，無法建立。`,
        });
      }
    }

    // 中文姓名重複檢查（警告，非阻擋）
    if (data.name_zh && !force_create) {
      const existingByName = await this.prisma.employee.findFirst({
        where: { name_zh: data.name_zh },
        select: { id: true, emp_code: true, name_zh: true },
      });
      if (existingByName) {
        throw new HttpException(
          {
            code: 'DUPLICATE_NAME_WARNING',
            message: `已有同名員工 ${existingByName.name_zh}（${existingByName.emp_code || 'N/A'}），是否確定繼續建立？`,
            existingEmployee: `${existingByName.name_zh}（${existingByName.emp_code || 'N/A'}）`,
          },
          HttpStatus.CONFLICT,
        );
      }
    }

    // 自動分配正式員工編號（臨時員工不分配），使用 gap-filling 邏輯找最小可用號
    if (!data.employee_is_temporary && !data.emp_code) {
      data.emp_code = await this.getNextEmpCode();
    }

    // Convert date string fields to Date objects for Prisma DateTime columns
    const dateFields = [
      'join_date',
      'termination_date',
      'date_of_birth',
      'mpf_employment_date',
      'mpf_old_employment_date',
      'employee_mpf_applied_date',
      'driving_license_expiry',
      'approved_worker_cert_expiry',
      'green_card_expiry',
      'construction_card_expiry',
      'earth_mover_cert_expiry',
      'crane_cert_expiry',
      'confined_space_cert_expiry',
      'abrasive_wheel_cert_expiry',
      'lifting_cert_expiry',
      'gas_welding_cert_expiry',
      'electric_welding_cert_expiry',
      'first_aid_cert_expiry',
      'signup_cert_expiry',
      'silver_card_expiry',
      'other_cert_expiry',
    ];
    for (const field of dateFields) {
      if (field in data && data[field]) {
        data[field] = new Date(data[field]);
      } else if (field in data && !data[field]) {
        data[field] = null;
      }
    }

    const saved = await this.prisma.employee.create({ data });

    // 自動建立空白薪酬配置（正式員工才建立）
    if (!data.employee_is_temporary) {
      try {
        const effectiveDate = data.join_date
          ? new Date(data.join_date)
          : new Date();
        await this.prisma.employeeSalarySetting.create({
          data: {
            employee_id: saved.id,
            effective_date: effectiveDate,
            salary_type: 'daily',
          },
        });
      } catch (e) {
        console.error('Auto salary setting creation error:', e);
      }
    }

    if (userId) {
      try {
        await this.auditLogsService.log({
          userId,
          action: 'create',
          targetTable: 'employees',
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

  async update(id: number, dto: any, userId?: number, ipAddress?: string) {
    const existing = await this.prisma.employee.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('員工不存在');
    const {
      salary_settings,
      transfers,
      company,
      created_at,
      updated_at,
      id: _id,
      ...updateData
    } = dto;
    // Convert date string fields to Date objects for Prisma @db.Date columns
    const dateFields = [
      'join_date',
      'termination_date',
      'date_of_birth',
      'mpf_employment_date',
      'mpf_old_employment_date',
      'employee_mpf_applied_date',
      'driving_license_expiry',
      'approved_worker_cert_expiry',
      'green_card_expiry',
      'construction_card_expiry',
      'earth_mover_cert_expiry',
      'crane_cert_expiry',
      'confined_space_cert_expiry',
      'abrasive_wheel_cert_expiry',
      'lifting_cert_expiry',
      'gas_welding_cert_expiry',
      'electric_welding_cert_expiry',
      'first_aid_cert_expiry',
      'signup_cert_expiry',
      'silver_card_expiry',
      'other_cert_expiry',
    ];
    for (const field of dateFields) {
      if (field in updateData) {
        updateData[field] = updateData[field]
          ? new Date(updateData[field])
          : null;
      }
    }
    // Validate emp_code uniqueness (excluding self)
    if (updateData.emp_code !== undefined && updateData.emp_code !== null && updateData.emp_code !== '') {
      const conflict = await this.prisma.employee.findFirst({
        where: {
          emp_code: updateData.emp_code as string,
          id: { not: id },
        },
        select: { id: true, name_zh: true, emp_code: true },
      });
      if (conflict) {
        throw new BadRequestException(
          `員工編號 ${updateData.emp_code} 已被員工「${conflict.name_zh}」使用，請選擇其他編號。`,
        );
      }
    }
    const updated = await this.prisma.employee.update({
      where: { id },
      data: updateData,
    });
    if (userId) {
      try {
        await this.auditLogsService.log({
          userId,
          action: 'update',
          targetTable: 'employees',
          targetId: id,
          changesBefore: existing,
          changesAfter: updated,
          ipAddress,
        });
      } catch (e) {
        console.error('Audit log error:', e);
      }
    }
    return this.findOne(id);
  }

  async terminate(
    id: number,
    dto: { termination_date: string; termination_reason?: string },
  ) {
    const emp = await this.prisma.employee.findUnique({ where: { id } });
    if (!emp) throw new NotFoundException('員工不存在');
    // 離職時註銷員工編號（加上 [revoked] 後綴，新員工不會重用此編號）
    const revokedCode =
      emp.emp_code && !emp.emp_code.includes('[revoked]')
        ? `${emp.emp_code} [revoked]`
        : emp.emp_code;
    await this.prisma.employee.update({
      where: { id },
      data: {
        status: 'inactive',
        emp_code: revokedCode,
        termination_date: new Date(dto.termination_date),
        termination_reason: dto.termination_reason || null,
      },
    });
    return this.findOne(id);
  }

  async reinstate(id: number) {
    const emp = await this.prisma.employee.findUnique({ where: { id } });
    if (!emp) throw new NotFoundException('員工不存在');
    // 復職時恢復員工編號（移除 [revoked] 後綴）
    let restoredCode = emp.emp_code
      ? emp.emp_code.replace(' [revoked]', '')
      : emp.emp_code;

    // 如果復職後沒有有效的員工編號且不是臨時員工，自動分配新編號
    if (!restoredCode && !emp.employee_is_temporary) {
      const existing = await this.prisma.employee.findMany({
        where: { emp_code: { not: null } },
        select: { emp_code: true },
      });
      let maxNum = 0;
      for (const e of existing) {
        if (!e.emp_code) continue;
        const match = e.emp_code.match(/^E(\d+)/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) maxNum = num;
        }
      }
      restoredCode = 'E' + String(maxNum + 1).padStart(3, '0');
    }

    await this.prisma.employee.update({
      where: { id },
      data: {
        status: 'active',
        emp_code: restoredCode,
        termination_date: null,
        termination_reason: null,
      },
    });
    return this.findOne(id);
  }

  async addSalarySetting(employeeId: number, dto: any) {
    return this.prisma.employeeSalarySetting.create({
      data: { ...dto, employee_id: employeeId },
    });
  }

  async getSalarySettings(employeeId: number) {
    return this.prisma.employeeSalarySetting.findMany({
      where: { employee_id: employeeId },
      orderBy: { effective_date: 'desc' },
    });
  }

  async transferEmployee(
    employeeId: number,
    dto: {
      from_company_id: number;
      to_company_id: number;
      transfer_date: string;
      notes?: string;
    },
  ) {
    await this.prisma.employeeTransfer.create({
      data: {
        employee_id: employeeId,
        from_company_id: dto.from_company_id,
        to_company_id: dto.to_company_id,
        transfer_date: new Date(dto.transfer_date),
        notes: dto.notes,
      },
    });
    await this.prisma.employee.update({
      where: { id: employeeId },
      data: { company_id: dto.to_company_id },
    });
    return this.findOne(employeeId);
  }

  async getPhoto(id: number) {
    const emp = await this.prisma.employee.findUnique({
      where: { id },
      select: {
        id: true,
        name_zh: true,
        name_en: true,
        employee_photo_base64: true,
      },
    });
    if (!emp) throw new NotFoundException('員工不存在');
    return {
      id: emp.id,
      name_zh: emp.name_zh,
      name_en: emp.name_en,
      hasPhoto: !!emp.employee_photo_base64,
      photo_base64: emp.employee_photo_base64,
    };
  }

  async updatePhoto(id: number, photoBase64: string) {
    const emp = await this.prisma.employee.findUnique({ where: { id } });
    if (!emp) throw new NotFoundException('員工不存在');
    await this.prisma.employee.update({
      where: { id },
      data: { employee_photo_base64: photoBase64 },
    });
    return { success: true, message: '標準照已更新' };
  }

  async deletePhoto(id: number) {
    const emp = await this.prisma.employee.findUnique({ where: { id } });
    if (!emp) throw new NotFoundException('員工不存在');
    await this.prisma.employee.update({
      where: { id },
      data: { employee_photo_base64: null },
    });
    return { success: true, message: '標準照已刪除' };
  }

  async convertToRegular(
    id: number,
    dto: {
      role: string;
      company_id: number;
      emp_code?: string;
      join_date?: string;
      phone?: string;
      name_en?: string;
      base_salary?: number;
      salary_type?: string;
    },
  ) {
    const emp = await this.prisma.employee.findUnique({ where: { id } });
    if (!emp) throw new NotFoundException('員工不存在');
    if (!emp.employee_is_temporary) throw new Error('此員工已是正式員工');
    // Auto-assign emp_code if not already set
    const empCode = emp.emp_code || (dto.emp_code ? dto.emp_code : await this.getNextEmpCode());
    const updateData: Record<string, unknown> = {
      employee_is_temporary: false,
      role: dto.role,
      company_id: dto.company_id,
      status: 'active',
      emp_code: empCode,
    };
    if (dto.join_date) updateData.join_date = new Date(dto.join_date);
    if (dto.phone) updateData.phone = dto.phone;
    if (dto.name_en) updateData.name_en = dto.name_en;
    await this.prisma.employee.update({ where: { id }, data: updateData });
    // If salary provided, create a salary setting
    if (dto.base_salary && dto.base_salary > 0) {
      await this.prisma.employeeSalarySetting.create({
        data: {
          employee_id: id,
          effective_date: dto.join_date ? new Date(dto.join_date) : new Date(),
          base_salary: dto.base_salary,
          salary_type: dto.salary_type || 'monthly',
          allowance_night: 0,
          allowance_rent: 0,
          allowance_3runway: 0,
          ot_rate_standard: 0,
        },
      });
    }
    return this.findOne(id);
  }

  async remove(id: number, userId?: number, ipAddress?: string) {
    const existing = await this.prisma.employee.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('員工不存在');
    if (userId) {
      try {
        await this.auditLogsService.log({
          userId,
          action: 'delete',
          targetTable: 'employees',
          targetId: id,
          changesBefore: existing,
          ipAddress,
        });
      } catch (e) {
        console.error('Audit log error:', e);
      }
    }
    await this.prisma.employee.update({
      where: { id },
      data: { deleted_at: new Date(), deleted_by: userId ?? null },
    });
    return { message: '刪除成功' };
  }

  /**
   * Batch delete employees by IDs.
   * type='inactive' restricts deletion to employees with status='inactive'.
   * type='temporary' restricts deletion to employees with employee_is_temporary=true.
   */
  async batchDelete(ids: number[], type?: 'inactive' | 'temporary') {
    if (!ids || ids.length === 0) throw new Error('請選擇要刪除的員工');
    const where: WhereClause = { id: { in: ids } };
    if (type === 'inactive') {
      where.status = 'inactive';
    } else if (type === 'temporary') {
      where.employee_is_temporary = true;
    }

    // 先查出實際符合條件的員工 ID（避免刪除不符合條件的關聯資料）
    const eligibleEmployees = await this.prisma.employee.findMany({
      where,
      select: { id: true },
    });
    const eligibleIds = eligibleEmployees.map((e) => e.id);

    if (eligibleIds.length === 0) {
      return { message: '沒有符合條件的員工可刪除', count: 0 };
    }

    // 先刪除所有外鍵關聯資料（cascade）
    await this.prisma.$transaction([
      this.prisma.employeeAttendance.deleteMany({
        where: {
          OR: [
            { employee_id: { in: eligibleIds } },
            { mid_shift_approved_by: { in: eligibleIds } },
          ],
        },
      }),
      this.prisma.employeeLeave.deleteMany({
        where: { employee_id: { in: eligibleIds } },
      }),
      this.prisma.employeeSalarySetting.deleteMany({
        where: { employee_id: { in: eligibleIds } },
      }),
      this.prisma.employeeTransfer.deleteMany({
        where: { employee_id: { in: eligibleIds } },
      }),
      this.prisma.employee.updateMany({
        where: { id: { in: eligibleIds } },
        data: { deleted_at: new Date() },
      }),
    ]);

    return {
      message: `已刪除 ${eligibleIds.length} 名員工`,
      count: eligibleIds.length,
    };
  }

  /**
   * Bulk-dismiss MPF alerts for employees hired more than 60 days ago.
   * Sets employee_mpf_applied = true so they no longer appear in the dashboard MPF alert list.
   * Employees hired within 60 days are NOT affected — they will still trigger the alert.
   */
  async mpfBulkDismiss() {
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const result = await this.prisma.employee.updateMany({
      where: {
        status: 'active',
        employee_is_temporary: false,
        employee_mpf_applied: false,
        join_date: { lte: sixtyDaysAgo },
      },
      data: {
        employee_mpf_applied: true,
        employee_mpf_applied_date: new Date(),
      },
    });

    return {
      message: `已清除 ${result.count} 位員工的 MPF 入職提醒（入職超過 60 天）`,
      dismissed_count: result.count,
    };
  }

  // ── Nickname Management ──

  async getNicknames(employeeId: number) {
    const emp = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true },
    });
    if (!emp) throw new NotFoundException('Employee not found');

    return this.prisma.employeeNickname.findMany({
      where: { emp_nickname_employee_id: employeeId },
      orderBy: { emp_nickname_created_at: 'desc' },
    });
  }

  async addNickname(
    employeeId: number,
    nicknameValue: string,
    source: string = 'manual',
  ) {
    if (!nicknameValue || nicknameValue.trim() === '') {
      throw new Error('Nickname cannot be empty');
    }
    const val = nicknameValue.trim();

    const emp = await this.prisma.employee.findUnique({
      where: { id: employeeId },
    });
    if (!emp) throw new NotFoundException('Employee not found');

    // Check if exists (upsert)
    return this.prisma.employeeNickname.upsert({
      where: {
        emp_nickname_employee_id_emp_nickname_value: {
          emp_nickname_employee_id: employeeId,
          emp_nickname_value: val,
        },
      },
      update: {},
      create: {
        emp_nickname_employee_id: employeeId,
        emp_nickname_value: val,
        emp_nickname_source: source,
      },
    });
  }

  async removeNickname(employeeId: number, nicknameId: number) {
    const record = await this.prisma.employeeNickname.findFirst({
      where: { id: nicknameId, emp_nickname_employee_id: employeeId },
    });
    if (!record) throw new NotFoundException('Nickname not found');

    return this.prisma.employeeNickname.delete({
      where: { id: nicknameId },
    });
  }

  /**
   * Check merge preview: returns count of all records that will be transferred
   * from source (temporary) employee to target (regular) employee.
   */
  async checkMerge(sourceId: number, targetId: number) {
    const source = await this.prisma.employee.findUnique({
      where: { id: sourceId },
      select: { id: true, name_zh: true, name_en: true, phone: true, created_at: true, employee_is_temporary: true },
    });
    if (!source) throw new NotFoundException('來源員工不存在');
    if (!source.employee_is_temporary) throw new BadRequestException('來源員工不是臨時員工');

    const target = await this.prisma.employee.findUnique({
      where: { id: targetId },
      include: { company: { select: { name: true, internal_prefix: true } } },
    });
    if (!target) throw new NotFoundException('目標員工不存在');
    if (target.employee_is_temporary) throw new BadRequestException('目標員工也是臨時員工，請選擇正式員工');
    if (target.deleted_at) throw new BadRequestException('目標員工已被刪除');

    const [workLogs, payrolls, attendances, leaves, expenses, anomalies, verificationRecords, verificationMappings] =
      await Promise.all([
        this.prisma.workLog.count({ where: { employee_id: sourceId } }),
        this.prisma.payroll.count({ where: { employee_id: sourceId } }),
        this.prisma.employeeAttendance.count({ where: { employee_id: sourceId } }),
        this.prisma.employeeLeave.count({ where: { employee_id: sourceId } }),
        this.prisma.expense.count({ where: { employee_id: sourceId } }),
        this.prisma.attendanceAnomaly.count({ where: { anomaly_employee_id: sourceId } }),
        this.prisma.verificationRecord.count({ where: { record_employee_id: sourceId } }),
        this.prisma.verificationNicknameMapping.count({ where: { nickname_employee_id: sourceId } }),
      ]);

    const records = { work_logs: workLogs, payrolls, attendances, leaves, expenses, attendance_anomalies: anomalies, verification_records: verificationRecords, verification_nickname_mappings: verificationMappings };
    const total_records = Object.values(records).reduce((a, b) => a + b, 0);

    return {
      source_employee: {
        id: source.id,
        name_zh: source.name_zh,
        name_en: source.name_en,
        phone: source.phone,
        created_at: source.created_at,
      },
      target_employee: {
        id: target.id,
        name_zh: target.name_zh,
        name_en: target.name_en,
        emp_code: target.emp_code,
        role: target.role,
        company_name: target.company ? (target.company.internal_prefix || target.company.name) : null,
      },
      records,
      total_records,
    };
  }

  /**
   * Execute merge: transfer all records from source (temporary) to target (regular) employee,
   * then hard-delete the source employee and its salary/transfer/nickname data.
   */
  async mergeEmployee(sourceId: number, targetId: number, userId?: number, ipAddress?: string) {
    const source = await this.prisma.employee.findUnique({ where: { id: sourceId } });
    if (!source) throw new NotFoundException('來源員工不存在');
    if (!source.employee_is_temporary) throw new BadRequestException('來源員工不是臨時員工');

    const target = await this.prisma.employee.findUnique({ where: { id: targetId } });
    if (!target) throw new NotFoundException('目標員工不存在');
    if (target.employee_is_temporary) throw new BadRequestException('目標員工也是臨時員工，請選擇正式員工');
    if (target.deleted_at) throw new BadRequestException('目標員工已被刪除');

    // Count records before merge for response
    const [workLogs, payrolls, attendances, leaves, expenses, anomalies, verificationRecords, verificationMappings] =
      await Promise.all([
        this.prisma.workLog.count({ where: { employee_id: sourceId } }),
        this.prisma.payroll.count({ where: { employee_id: sourceId } }),
        this.prisma.employeeAttendance.count({ where: { employee_id: sourceId } }),
        this.prisma.employeeLeave.count({ where: { employee_id: sourceId } }),
        this.prisma.expense.count({ where: { employee_id: sourceId } }),
        this.prisma.attendanceAnomaly.count({ where: { anomaly_employee_id: sourceId } }),
        this.prisma.verificationRecord.count({ where: { record_employee_id: sourceId } }),
        this.prisma.verificationNicknameMapping.count({ where: { nickname_employee_id: sourceId } }),
      ]);

    await this.prisma.$transaction(async (tx) => {
      // 1. Transfer work_logs
      await tx.workLog.updateMany({ where: { employee_id: sourceId }, data: { employee_id: targetId } });
      // 2. Transfer payrolls
      await tx.payroll.updateMany({ where: { employee_id: sourceId }, data: { employee_id: targetId } });
      // 3. Transfer employee_attendances
      await tx.employeeAttendance.updateMany({ where: { employee_id: sourceId }, data: { employee_id: targetId } });
      // 4. Transfer employee_leaves
      await tx.employeeLeave.updateMany({ where: { employee_id: sourceId }, data: { employee_id: targetId } });
      // 5. Transfer expenses
      await tx.expense.updateMany({ where: { employee_id: sourceId }, data: { employee_id: targetId } });
      // 6. Transfer attendance_anomalies
      await tx.attendanceAnomaly.updateMany({ where: { anomaly_employee_id: sourceId }, data: { anomaly_employee_id: targetId } });
      // 7. Transfer verification_records
      await tx.verificationRecord.updateMany({ where: { record_employee_id: sourceId }, data: { record_employee_id: targetId } });
      // 8. Transfer verification_nickname_mappings
      await tx.verificationNicknameMapping.updateMany({ where: { nickname_employee_id: sourceId }, data: { nickname_employee_id: targetId } });
      // 9. Handle salary settings: transfer if target has none, otherwise delete source's
      const targetSalaryCount = await tx.employeeSalarySetting.count({ where: { employee_id: targetId } });
      if (targetSalaryCount === 0) {
        // Target has no salary settings - transfer source's settings to target
        await tx.employeeSalarySetting.updateMany({ where: { employee_id: sourceId }, data: { employee_id: targetId } });
      } else {
        // Target already has salary settings - discard source's (target takes priority)
        await tx.employeeSalarySetting.deleteMany({ where: { employee_id: sourceId } });
      }
      await tx.employeeTransfer.deleteMany({ where: { employee_id: sourceId } });
      await tx.employeeNickname.deleteMany({ where: { emp_nickname_employee_id: sourceId } });
      // 10. Hard-delete the source employee
      await tx.employee.delete({ where: { id: sourceId } });
    });

    if (userId) {
      try {
        await this.auditLogsService.log({
          userId,
          action: 'update',
          targetTable: 'employees',
          targetId: targetId,
          changesBefore: { source_employee_id: sourceId, source_name: source.name_zh },
          changesAfter: { merged_into: targetId, target_name: target.name_zh },
          ipAddress,
        });
      } catch (e) {
        console.error('Audit log error:', e);
      }
    }

    const transferred = { work_logs: workLogs, payrolls, attendances, leaves, expenses, attendance_anomalies: anomalies, verification_records: verificationRecords, verification_nickname_mappings: verificationMappings };
    return {
      success: true,
      transferred,
      total_transferred: Object.values(transferred).reduce((a, b) => a + b, 0),
      deleted_source_id: sourceId,
    };
  }

  async searchByNickname(q: string) {
    if (!q || q.trim().length === 0) return [];
    const term = q.trim();

    // Search in employee primary nickname/name, or in mappings
    const employees = await this.prisma.employee.findMany({
      where: {
        OR: [
          { nickname: { contains: term, mode: 'insensitive' } },
          { name_zh: { contains: term, mode: 'insensitive' } },
          { name_en: { contains: term, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        name_zh: true,
        nickname: true,
        role: true,
        status: true,
      },
      take: 10,
    });

    const mappedEmployees =
      await this.prisma.verificationNicknameMapping.findMany({
        where: {
          nickname_value: { contains: term, mode: 'insensitive' },
          nickname_is_active: true,
          nickname_employee_id: { not: null },
        },
        select: { nickname_employee_id: true },
        take: 10,
      });

    const mappedIds = mappedEmployees
      .map((m) => m.nickname_employee_id)
      .filter((id) => id !== null) as number[];
    const allIds = [...new Set([...employees.map((e) => e.id), ...mappedIds])];

    if (allIds.length === 0) return [];

    return this.prisma.employee.findMany({
      where: { id: { in: allIds } },
      select: {
        id: true,
        name_zh: true,
        nickname: true,
        role: true,
        status: true,
      },
    });
  }
}
