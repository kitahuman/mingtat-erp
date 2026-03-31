import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RateCard } from './rate-card.entity';
import { RateCardOtRate } from './rate-card-ot-rate.entity';

@Injectable()
export class RateCardsService {
  constructor(
    @InjectRepository(RateCard) private repo: Repository<RateCard>,
    @InjectRepository(RateCardOtRate) private otRepo: Repository<RateCardOtRate>,
  ) {}

  private readonly allowedSortFields = [
    'id', 'name', 'service_type', 'vehicle_tonnage', 'vehicle_type',
    'origin', 'destination', 'day_rate', 'night_rate', 'status',
    'effective_date', 'expiry_date', 'created_at',
  ];

  async findAll(query: {
    page?: number; limit?: number; search?: string;
    company_id?: number; client_id?: number; service_type?: string;
    vehicle_tonnage?: string; vehicle_type?: string; status?: string;
    project_id?: number; source_quotation_id?: number;
    sortBy?: string; sortOrder?: string;
  }) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const qb = this.repo.createQueryBuilder('rc')
      .leftJoinAndSelect('rc.company', 'company')
      .leftJoinAndSelect('rc.client', 'client')
      .leftJoinAndSelect('rc.source_quotation', 'source_quotation')
      .leftJoinAndSelect('rc.project', 'project');

    if (query.search) {
      qb.andWhere(
        '(rc.name ILIKE :s OR rc.description ILIKE :s OR rc.origin ILIKE :s OR rc.destination ILIKE :s OR rc.contract_no ILIKE :s OR client.name ILIKE :s)',
        { s: `%${query.search}%` },
      );
    }
    if (query.company_id) qb.andWhere('rc.company_id = :cid', { cid: query.company_id });
    if (query.client_id) qb.andWhere('rc.client_id = :clid', { clid: query.client_id });
    if (query.service_type) qb.andWhere('rc.service_type = :st', { st: query.service_type });
    if (query.vehicle_tonnage) qb.andWhere('rc.vehicle_tonnage = :vt', { vt: query.vehicle_tonnage });
    if (query.vehicle_type) qb.andWhere('rc.vehicle_type = :vtp', { vtp: query.vehicle_type });
    if (query.status) qb.andWhere('rc.status = :status', { status: query.status });
    if (query.project_id) qb.andWhere('rc.project_id = :pid', { pid: query.project_id });
    if (query.source_quotation_id) qb.andWhere('rc.source_quotation_id = :sqid', { sqid: query.source_quotation_id });

    const sortBy = this.allowedSortFields.includes(query.sortBy || '') ? query.sortBy! : 'id';
    const sortOrder = (query.sortOrder?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC') as 'ASC' | 'DESC';
    qb.orderBy(`rc.${sortBy}`, sortOrder);

    const [data, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number) {
    const rc = await this.repo.findOne({
      where: { id },
      relations: ['company', 'client', 'ot_rates', 'source_quotation', 'project'],
    });
    if (!rc) throw new NotFoundException('價目表不存在');
    return rc;
  }

  async create(dto: any) {
    const { ot_rates, ...data } = dto;
    const entity = this.repo.create(data);
    const saved: RateCard = await (this.repo.save(entity) as any);

    if (ot_rates && ot_rates.length > 0) {
      const otEntities = ot_rates.map((ot: any) =>
        this.otRepo.create({ ...ot, rate_card_id: saved.id }),
      );
      await this.otRepo.save(otEntities);
    }

    return this.findOne(saved.id);
  }

  async update(id: number, dto: any) {
    const existing = await this.repo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('價目表不存在');

    const { ot_rates, company, client, source_quotation, project, created_at, updated_at, id: _id, ...updateData } = dto;
    await this.repo.update(id, updateData);

    if (ot_rates !== undefined) {
      await this.otRepo.delete({ rate_card_id: id });
      if (ot_rates.length > 0) {
        const otEntities = ot_rates.map((ot: any) =>
          this.otRepo.create({ ...ot, rate_card_id: id, id: undefined }),
        );
        await this.otRepo.save(otEntities);
      }
    }

    return this.findOne(id);
  }
}
