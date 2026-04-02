import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EmployeesService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: {
    page?: number; limit?: number; search?: string;
    role?: string; company_id?: number; status?: string;
    sortBy?: string; sortOrder?: string;
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

    const allowedSortFields = ['emp_code', 'name_zh', 'name_en', 'role', 'phone', 'green_card_expiry', 'construction_card_expiry', 'driving_license_expiry', 'status', 'id', 'join_date', 'termination_date', 'created_at'];
    const sortBy = allowedSortFields.includes(query.sortBy || '') ? query.sortBy! : 'id';
    const sortOrder = query.sortOrder?.toUpperCase() === 'DESC' ? 'desc' : 'asc';

    const [data, total] = await Promise.all([
      this.prisma.employee.findMany({
        where,
        include: { company: true },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.employee.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
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