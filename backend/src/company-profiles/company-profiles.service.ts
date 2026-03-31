import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompanyProfile } from './company-profile.entity';

@Injectable()
export class CompanyProfilesService {
  constructor(
    @InjectRepository(CompanyProfile) private repo: Repository<CompanyProfile>,
  ) {}

  private readonly allowedSortFields = [
    'id', 'code', 'chinese_name', 'english_name', 'br_expiry_date',
    'subcontractor_reg_expiry', 'status', 'created_at',
  ];

  async findAll(query: {
    page?: number; limit?: number; search?: string;
    sortBy?: string; sortOrder?: string;
  }) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const qb = this.repo.createQueryBuilder('cp');

    if (query.search) {
      qb.andWhere(
        '(cp.code ILIKE :s OR cp.chinese_name ILIKE :s OR cp.english_name ILIKE :s)',
        { s: `%${query.search}%` },
      );
    }

    const sortBy = this.allowedSortFields.includes(query.sortBy || '')
      ? query.sortBy!
      : 'code';
    const sortOrder = (query.sortOrder?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC') as 'ASC' | 'DESC';
    qb.orderBy(`cp.${sortBy}`, sortOrder);

    const [data, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number) {
    const profile = await this.repo.findOne({ where: { id } });
    if (!profile) throw new NotFoundException('公司資料不存在');
    return profile;
  }

  async findByCode(code: string) {
    return this.repo.findOne({ where: { code } });
  }

  async simple() {
    return this.repo.find({
      where: { status: 'active' },
      select: ['id', 'code', 'chinese_name', 'english_name'],
      order: { code: 'ASC' },
    });
  }

  async create(dto: Partial<CompanyProfile>) {
    const entity = this.repo.create(dto);
    return this.repo.save(entity);
  }

  async update(id: number, dto: Partial<CompanyProfile>) {
    const profile = await this.repo.findOne({ where: { id } });
    if (!profile) throw new NotFoundException('公司資料不存在');
    const { created_at, updated_at, id: _id, ...updateData } = dto as any;
    await this.repo.update(id, updateData);
    return this.repo.findOne({ where: { id } });
  }

  async getExpiryAlerts() {
    const sixtyDaysLater = new Date();
    sixtyDaysLater.setDate(sixtyDaysLater.getDate() + 60);
    const sixtyStr = sixtyDaysLater.toISOString().split('T')[0];

    const profiles = await this.repo.find({ where: { status: 'active' as any } });
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
