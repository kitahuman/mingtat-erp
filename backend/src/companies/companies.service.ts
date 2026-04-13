import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CompaniesService {
  constructor(private prisma: PrismaService, private readonly auditLogsService: AuditLogsService) {}

  async findAll(query: { page?: number; limit?: number; search?: string; company_type?: string; status?: string; exclude_external?: string }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const where: any = { deleted_at: null };

    if (query.company_type) where.company_type = query.company_type;
    if (query.status) where.status = query.status;
    if (query.exclude_external === 'true') {
      where.company_type = { not: 'external' };
    }
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

  async create(dto: any, userId?: number) {
    const saved = await this.prisma.company.create({ data: dto });
    if (userId) {
      try {
        await this.auditLogsService.log({
          userId,
          action: 'create',
          targetTable: 'companies',
          targetId: saved.id,
          changesAfter: saved,
        });
      } catch (e) { console.error('Audit log error:', e); }
    }
    return saved;
  }

  async update(id: number, dto: any, userId?: number) {
    const existing = await this.prisma.company.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('公司不存在');
    const { id: _id, created_at, updated_at, employees, vehicles, machinery, ...updateData } = dto;
    const updated = await this.prisma.company.update({ where: { id }, data: updateData });
    if (userId) {
      try {
        await this.auditLogsService.log({
          userId,
          action: 'update',
          targetTable: 'companies',
          targetId: id,
          changesBefore: existing,
          changesAfter: updated,
        });
      } catch (e) { console.error('Audit log error:', e); }
    }
    return this.findOne(id);
  }

  async findAllSimple() {
    return this.prisma.company.findMany({
      where: { status: 'active', company_type: { not: 'external' } },
      orderBy: { id: 'asc' },
    });
  }
}
