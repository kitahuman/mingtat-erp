import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EmployeesService {
  constructor(private prisma: PrismaService) {}

  /**
   * Parse column filter parameters from query.
   * Supports: filter_<field>=value1,value2
   * For relation fields like company, maps to company_id via lookup.
   */
  private parseColumnFilters(query: Record<string, any>): Record<string, string[]> {
    const filters: Record<string, string[]> = {};
    for (const key of Object.keys(query)) {
      if (key.startsWith('filter_') && query[key]) {
        const field = key.replace('filter_', '');
        const values = String(query[key]).split(',').map(v => v.trim()).filter(Boolean);
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
  private buildColumnFilterWhere(filters: Record<string, string[]>): any {
    const conditions: any[] = [];

    // Scalar fields that can be filtered directly with `in`
    const scalarFields = [
      'role', 'status', 'emp_code', 'name_zh', 'name_en', 'phone', 'id_number',
      'termination_reason',
    ];
    // Date fields: filter by formatted date string match (we'll handle these specially)
    const dateFields = [
      'join_date', 'termination_date', 'green_card_expiry',
      'construction_card_expiry', 'driving_license_expiry',
    ];

    for (const [field, values] of Object.entries(filters)) {
      if (field === 'company') {
        // Company is a relation field - filter by company.internal_prefix or company.name
        // Handle the special '-' value meaning null company
        const hasNull = values.includes('-');
        const nonNullValues = values.filter(v => v !== '-');

        const companyConditions: any[] = [];
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
        const dateValues = values.filter(v => v !== '-');

        const dateConditions: any[] = [];
        if (dateValues.length > 0) {
          // Parse DD/MM/YYYY format dates to Date ranges
          const dateRanges: any[] = [];
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
        const nonNullValues = values.filter(v => v !== '-');

        const fieldConditions: any[] = [];
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
    page?: number; limit?: number; search?: string;
    role?: string; company_id?: number; status?: string;
    sortBy?: string; sortOrder?: string;
    [key: string]: any; // Allow filter_* params
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const where: any = {};

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
    const allowedSortFields = ['emp_code', 'name_zh', 'name_en', 'role', 'phone', 'green_card_expiry', 'construction_card_expiry', 'driving_license_expiry', 'status', 'id', 'join_date', 'termination_date', 'termination_reason', 'id_number', 'created_at'];
    const sortOrder = query.sortOrder?.toUpperCase() === 'DESC' ? 'desc' : 'asc';
    let orderBy: any;

    if (query.sortBy === 'company') {
      // Sort by company.internal_prefix (relation field)
      orderBy = { company: { internal_prefix: sortOrder } };
    } else {
      const sortBy = allowedSortFields.includes(query.sortBy || '') ? query.sortBy! : 'id';
      orderBy = { [sortBy]: sortOrder };
    }

    const [data, total] = await Promise.all([
      this.prisma.employee.findMany({
        where,
        include: { company: true },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.employee.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * Get distinct filter options for a given column.
   * Used by frontend DataTable to populate column filter dropdowns with all possible values,
   * not just the values on the current page.
   */
  async getFilterOptions(column: string, query: {
    search?: string; role?: string; company_id?: number; status?: string;
    [key: string]: any;
  }) {
    // Build the same base where clause as findAll (excluding the column being filtered)
    const where: any = {};
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
      const values = employees.map(e =>
        e.company?.internal_prefix || e.company?.name || '-'
      );
      return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    }

    // For scalar fields, use groupBy or distinct
    const scalarFields = [
      'role', 'status', 'emp_code', 'name_zh', 'name_en', 'phone', 'id_number',
      'join_date', 'termination_date', 'green_card_expiry',
      'construction_card_expiry', 'driving_license_expiry', 'termination_reason',
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
      },
    });
    if (!emp) throw new NotFoundException('員工不存在');
    return emp;
  }

  async create(dto: any) {
    const { company, salary_settings, transfers, ...data } = dto;
    const saved = await this.prisma.employee.create({ data });
    return this.findOne(saved.id);
  }

  async update(id: number, dto: any) {
    const existing = await this.prisma.employee.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('員工不存在');
    const { salary_settings, transfers, company, created_at, updated_at, id: _id, ...updateData } = dto;
    // Convert date string fields to Date objects for Prisma @db.Date columns
    const dateFields = ['join_date', 'termination_date', 'date_of_birth', 'mpf_employment_date', 'mpf_old_employment_date',
      'driving_license_expiry', 'approved_worker_cert_expiry', 'green_card_expiry', 'construction_card_expiry',
      'earth_mover_cert_expiry', 'crane_cert_expiry', 'confined_space_cert_expiry', 'abrasive_wheel_cert_expiry',
      'lifting_cert_expiry', 'gas_welding_cert_expiry', 'electric_welding_cert_expiry', 'first_aid_cert_expiry',
      'signup_cert_expiry', 'silver_card_expiry', 'other_cert_expiry'];
    for (const field of dateFields) {
      if (field in updateData) {
        updateData[field] = updateData[field] ? new Date(updateData[field]) : null;
      }
    }
    await this.prisma.employee.update({ where: { id }, data: updateData });
    return this.findOne(id);
  }

  async terminate(id: number, dto: { termination_date: string; termination_reason?: string }) {
    const emp = await this.prisma.employee.findUnique({ where: { id } });
    if (!emp) throw new NotFoundException('員工不存在');
    // 離職時註銷員工編號（加上 [revoked] 後綴，新員工不會重用此編號）
    const revokedCode = emp.emp_code && !emp.emp_code.includes('[revoked]')
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
    const restoredCode = emp.emp_code ? emp.emp_code.replace(' [revoked]', '') : emp.emp_code;
    await this.prisma.employee.update({
      where: { id },
      data: { status: 'active', emp_code: restoredCode, termination_date: null, termination_reason: null },
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

  async transferEmployee(employeeId: number, dto: { from_company_id: number; to_company_id: number; transfer_date: string; notes?: string }) {
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

  async remove(id: number) {
    const existing = await this.prisma.employee.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('員工不存在');
    await this.prisma.employee.delete({ where: { id } });
    return { message: '刪除成功' };
  }

}
