import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CompanyProfilesService {
  constructor(private prisma: PrismaService) {}

  private readonly allowedSortFields = [
    'id', 'code', 'chinese_name', 'english_name', 'br_expiry_date',
    'subcontractor_reg_expiry', 'status', 'created_at',
  ];

  async findAll(query: {
    page?: number; limit?: number; search?: string;
    sortBy?: string; sortOrder?: string;
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const where: any = {};

    if (query.search) {
      where.OR = [
        { code: { contains: query.search, mode: 'insensitive' } },
        { chinese_name: { contains: query.search, mode: 'insensitive' } },
        { english_name: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const sortBy = this.allowedSortFields.includes(query.sortBy || '') ? query.sortBy! : 'code';
    const sortOrder = query.sortOrder?.toUpperCase() === 'DESC' ? 'desc' : 'asc';

    const [data, total] = await Promise.all([
      this.prisma.companyProfile.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.companyProfile.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number) {
    const profile = await this.prisma.companyProfile.findUnique({ where: { id } });
    if (!profile) throw new NotFoundException('公司資料不存在');
    return profile;
  }

  async findByCode(code: string) {
    return this.prisma.companyProfile.findUnique({ where: { code } });
  }

  async simple() {
    return this.prisma.companyProfile.findMany({
      where: { status: 'active' },
      select: { id: true, code: true, chinese_name: true, english_name: true },
      orderBy: { code: 'asc' },
    });
  }

  async create(dto: any) {
    return this.prisma.companyProfile.create({ data: dto });
  }

  async update(id: number, dto: any) {
    const profile = await this.prisma.companyProfile.findUnique({ where: { id } });
    if (!profile) throw new NotFoundException('公司資料不存在');
    const { created_at, updated_at, id: _id, ...updateData } = dto;
    return this.prisma.companyProfile.update({ where: { id }, data: updateData });
  }

  async getExpiryAlerts() {
    const sixtyDaysLater = new Date();
    sixtyDaysLater.setDate(sixtyDaysLater.getDate() + 60);
    const sixtyStr = sixtyDaysLater.toISOString().split('T')[0];

    const profiles = await this.prisma.companyProfile.findMany({
      where: { status: 'active' },
    });
    const alerts: any[] = [];

    for (const p of profiles) {
      const checks = [
        { type: '商業登記', date: p.br_expiry_date },
        { type: '分包商註冊', date: p.subcontractor_reg_expiry },
      ];
      for (const c of checks) {
        if (c.date && c.date <= sixtyStr) {
          alerts.push({
            id: p.id,
            name: `${p.code} ${p.chinese_name}`,
            type: c.type,
            expiry_date: c.date,
            module: 'company-profile',
          });
        }
      }
    }
    alerts.sort((a, b) => (a.expiry_date || '').localeCompare(b.expiry_date || ''));
    return alerts;
  }
}
