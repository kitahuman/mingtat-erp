import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PartnersService {
  constructor(private prisma: PrismaService) {}

  private readonly allowedSortFields = [
    'id', 'code', 'english_code', 'name', 'name_en', 'partner_type',
    'contact_person', 'phone', 'email', 'status', 'created_at', 'updated_at',
  ];

  async findAll(query: {
    page?: number; limit?: number; search?: string;
    partner_type?: string; category?: string; status?: string;
    sortBy?: string; sortOrder?: string;
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const where: any = {};

    if (query.partner_type) where.partner_type = query.partner_type;
    if (query.category) where.category = query.category;
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { name_en: { contains: query.search, mode: 'insensitive' } },
        { code: { contains: query.search, mode: 'insensitive' } },
        { english_code: { contains: query.search, mode: 'insensitive' } },
        { contact_person: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const sortBy = this.allowedSortFields.includes(query.sortBy || '') ? query.sortBy! : 'code';
    const sortOrder = query.sortOrder?.toUpperCase() === 'DESC' ? 'desc' : 'asc';

    const [data, total] = await Promise.all([
      this.prisma.partner.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.partner.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number) {
    const partner = await this.prisma.partner.findUnique({ where: { id } });
    if (!partner) throw new NotFoundException('合作單位不存在');
    return partner;
  }

  async simple() {
    return this.prisma.partner.findMany({
      where: { status: 'active' },
      select: { id: true, name: true, short_name: true, code: true, english_code: true, partner_type: true, category: true },
      orderBy: { code: 'asc' },
    });
  }

  private serializeDto(dto: any) {
    const { subsidiaries, ...rest } = dto;
    const data: any = { ...rest };
    // subsidiaries is stored as comma-separated string in DB
    if (Array.isArray(subsidiaries)) {
      data.subsidiaries = subsidiaries.length > 0 ? subsidiaries.join(',') : null;
    } else if (typeof subsidiaries === 'string') {
      data.subsidiaries = subsidiaries || null;
    }
    return data;
  }

  async create(dto: any) {
    return this.prisma.partner.create({ data: this.serializeDto(dto) });
  }

  async update(id: number, dto: any) {
    const partner = await this.prisma.partner.findUnique({ where: { id } });
    if (!partner) throw new NotFoundException('合作單位不存在');
    const { created_at, updated_at, id: _id, ...rest } = dto;
    const updateData = this.serializeDto(rest);
    return this.prisma.partner.update({ where: { id }, data: updateData });
  }

  async bulkCreate(dtos: any[]) {
    const results: any[] = [];
    for (const dto of dtos) {
      const created = await this.prisma.partner.create({ data: this.serializeDto(dto) });
      results.push(created);
    }
    return results;
  }

  async remove(id: number) {
    const existing = await this.prisma.partner.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            contracts_as_client: true,
            projects_as_client: true,
          },
        },
      },
    });
    if (!existing) throw new NotFoundException('合作單位不存在');

    // Check contracts first
    if (existing._count.contracts_as_client > 0) {
      throw new BadRequestException('此客戶下仍有合約，無法刪除');
    }

    // Check direct projects (without contract)
    if (existing._count.projects_as_client > 0) {
      throw new BadRequestException('此客戶下仍有項目，無法刪除');
    }

    await this.prisma.partner.delete({ where: { id } });
    return { message: '刪除成功' };
  }

}
