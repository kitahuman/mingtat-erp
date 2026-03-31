import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Partner } from './partner.entity';

@Injectable()
export class PartnersService {
  constructor(
    @InjectRepository(Partner) private repo: Repository<Partner>,
  ) {}

  async findAll(query: {
    page?: number; limit?: number; search?: string;
    partner_type?: string; category?: string; status?: string;
    sortBy?: string; sortOrder?: string;
  }) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const qb = this.repo.createQueryBuilder('p');

    if (query.search) {
      qb.andWhere('(p.name ILIKE :s OR p.name_en ILIKE :s OR p.contact_person ILIKE :s OR p.phone ILIKE :s)', { s: `%${query.search}%` });
    }
    if (query.partner_type) qb.andWhere('p.partner_type = :pt', { pt: query.partner_type });
    if (query.category) qb.andWhere('p.category = :cat', { cat: query.category });
    if (query.status) qb.andWhere('p.status = :st', { st: query.status });

    // Sorting
    const sortBy = query.sortBy || 'name';
    const sortOrder = (query.sortOrder?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC') as 'ASC' | 'DESC';
    qb.orderBy(`p.${sortBy}`, sortOrder);

    const [data, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number) {
    const partner = await this.repo.findOne({ where: { id } });
    if (!partner) throw new NotFoundException('合作單位不存在');
    return partner;
  }

  async simple() {
    return this.repo.find({
      where: { status: 'active' },
      select: ['id', 'name', 'partner_type', 'category'],
      order: { name: 'ASC' },
    });
  }

  async create(dto: Partial<Partner>) {
    const entity = this.repo.create(dto);
    return this.repo.save(entity);
  }

  async update(id: number, dto: Partial<Partner>) {
    const partner = await this.repo.findOne({ where: { id } });
    if (!partner) throw new NotFoundException('合作單位不存在');
    await this.repo.update(id, dto);
    return this.repo.findOne({ where: { id } });
  }
}
