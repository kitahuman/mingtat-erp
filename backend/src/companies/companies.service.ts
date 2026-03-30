import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, ILike } from 'typeorm';
import { Company } from './company.entity';

@Injectable()
export class CompaniesService {
  constructor(@InjectRepository(Company) private repo: Repository<Company>) {}

  async findAll(query: { page?: number; limit?: number; search?: string; company_type?: string; status?: string }) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const where: any = {};
    if (query.company_type) where.company_type = query.company_type;
    if (query.status) where.status = query.status;

    const qb = this.repo.createQueryBuilder('c');
    if (query.search) {
      qb.where('(c.name ILIKE :s OR c.name_en ILIKE :s OR c.internal_prefix ILIKE :s)', { s: `%${query.search}%` });
    }
    if (query.company_type) qb.andWhere('c.company_type = :ct', { ct: query.company_type });
    if (query.status) qb.andWhere('c.status = :st', { st: query.status });

    const [data, total] = await qb
      .orderBy('c.id', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number) {
    const company = await this.repo.findOne({
      where: { id },
      relations: ['employees', 'vehicles', 'machinery'],
    });
    if (!company) throw new NotFoundException('公司不存在');
    return company;
  }

  async create(dto: Partial<Company>) {
    const entity = this.repo.create(dto);
    return this.repo.save(entity);
  }

  async update(id: number, dto: Partial<Company>) {
    await this.repo.update(id, dto);
    return this.findOne(id);
  }

  async findAllSimple() {
    return this.repo.find({ where: { status: 'active' }, order: { id: 'ASC' } });
  }
}
