import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CompaniesService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: { page?: number; limit?: number; search?: string; company_type?: string; status?: string }) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const where: any = {};

    if (query.company_type) where.company_type = query.company_type;
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { name_en: { contains: query.search, mode: 'insensitive' } },
        { internal_prefix: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.company.findMany({
        where,
        orderBy: { id: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.company.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number) {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: { employees: true, vehicles: true, machinery: true },
    });
    if (!company) throw new NotFoundException('公司不存在');
    return company;
  }

  async create(dto: any) {
    return this.prisma.company.create({ data: dto });
  }

  async update(id: number, dto: any) {
    const existing = await this.prisma.company.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('公司不存在');
    const { id: _id, created_at, updated_at, employees, vehicles, machinery, ...updateData } = dto;
    await this.prisma.company.update({ where: { id }, data: updateData });
    return this.findOne(id);
  }

  async findAllSimple() {
    return this.prisma.company.findMany({
      where: { status: 'active' },
      orderBy: { id: 'asc' },
    });
  }
}
