import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SalaryConfigService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly allowedSortFields = [
    'id', 'employee_id', 'effective_date', 'base_salary', 'salary_type', 'created_at',
  ];

  async findAll(query: {
    page?: number; limit?: number; search?: string;
    employee_id?: number; salary_type?: string; is_piece_rate?: string;
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
    if (query.search) {
      where.employee = {
        OR: [
          { name_zh: { contains: query.search, mode: 'insensitive' } },
          { name_en: { contains: query.search, mode: 'insensitive' } },
          { emp_code: { contains: query.search, mode: 'insensitive' } },
        ],
      };
    }

    const sortBy = this.allowedSortFields.includes(query.sortBy || '') ? query.sortBy! : 'effective_date';
    const sortOrder = (query.sortOrder?.toUpperCase() === 'ASC' ? 'asc' : 'desc') as 'asc' | 'desc';

    const [data, total] = await Promise.all([
      this.prisma.employeeSalarySetting.findMany({
        where,
        include: { employee: { include: { company: true } } },
        orderBy: { [sortBy]: sortOrder },
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

  async create(dto: any) {
    // Ensure numeric fields
    const numericFields = [
      'base_salary', 'allowance_night', 'allowance_rent', 'allowance_3runway',
      'ot_rate_standard', 'allowance_well', 'allowance_machine', 'allowance_roller',
      'allowance_crane', 'allowance_move_machine', 'allowance_kwh_night',
      'allowance_mid_shift', 'ot_1800_1900', 'ot_1900_2000', 'ot_0600_0700',
      'ot_0700_0800', 'change_amount',
    ];
    for (const field of numericFields) {
      if (dto[field] !== undefined) {
        dto[field] = Number(dto[field]) || 0;
      }
    }

    const saved = await this.prisma.employeeSalarySetting.create({ data: dto });
    return this.findOne(saved.id);
  }

  async update(id: number, dto: any) {
    const existing = await this.prisma.employeeSalarySetting.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('薪酬設定不存在');

    const { employee, created_at, id: _id, ...updateData } = dto;

    const numericFields = [
      'base_salary', 'allowance_night', 'allowance_rent', 'allowance_3runway',
      'ot_rate_standard', 'allowance_well', 'allowance_machine', 'allowance_roller',
      'allowance_crane', 'allowance_move_machine', 'allowance_kwh_night',
      'allowance_mid_shift', 'ot_1800_1900', 'ot_1900_2000', 'ot_0600_0700',
      'ot_0700_0800', 'change_amount',
    ];
    for (const field of numericFields) {
      if (updateData[field] !== undefined) {
        updateData[field] = Number(updateData[field]) || 0;
      }
    }

    await this.prisma.employeeSalarySetting.update({ where: { id }, data: updateData });
    return this.findOne(id);
  }

  async delete(id: number) {
    const existing = await this.prisma.employeeSalarySetting.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('薪酬設定不存在');
    await this.prisma.employeeSalarySetting.delete({ where: { id } });
    return { deleted: true };
  }
}
