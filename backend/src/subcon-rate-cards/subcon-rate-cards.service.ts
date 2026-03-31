import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubconRateCard } from './subcon-rate-card.entity';

@Injectable()
export class SubconRateCardsService {
  constructor(
    @InjectRepository(SubconRateCard) private repo: Repository<SubconRateCard>,
  ) {}

  private readonly allowedSortFields = [
    'id', 'plate_no', 'vehicle_tonnage', 'day_night', 'origin', 'destination',
    'unit_price', 'unit', 'status', 'created_at',
  ];

  async findAll(query: {
    page?: number; limit?: number; search?: string;
    subcon_id?: number; client_id?: number; vehicle_tonnage?: string;
    day_night?: string; status?: string;
    sortBy?: string; sortOrder?: string;
  }) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const qb = this.repo.createQueryBuilder('src')
      .leftJoinAndSelect('src.subcontractor', 'subcontractor')
      .leftJoinAndSelect('src.client', 'client');

    if (query.search) {
      qb.andWhere(
        '(src.plate_no ILIKE :s OR src.origin ILIKE :s OR src.destination ILIKE :s OR src.contract_no ILIKE :s OR src.remarks ILIKE :s OR subcontractor.name ILIKE :s OR client.name ILIKE :s)',
        { s: `%${query.search}%` },
      );
    }
    if (query.subcon_id) qb.andWhere('src.subcon_id = :sid', { sid: query.subcon_id });
    if (query.client_id) qb.andWhere('src.client_id = :clid', { clid: query.client_id });
    if (query.vehicle_tonnage) qb.andWhere('src.vehicle_tonnage = :vt', { vt: query.vehicle_tonnage });
    if (query.day_night) qb.andWhere('src.day_night = :dn', { dn: query.day_night });
    if (query.status) qb.andWhere('src.status = :status', { status: query.status });

    const sortBy = this.allowedSortFields.includes(query.sortBy || '') ? query.sortBy! : 'id';
    const sortOrder = (query.sortOrder?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC') as 'ASC' | 'DESC';
    qb.orderBy(`src.${sortBy}`, sortOrder);

    const [data, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number) {
    const src = await this.repo.findOne({
      where: { id },
      relations: ['subcontractor', 'client'],
    });
    if (!src) throw new NotFoundException('街車價目表不存在');
    return src;
  }

  async create(dto: Partial<SubconRateCard>) {
    const entity = this.repo.create(dto);
    const saved: SubconRateCard = await (this.repo.save(entity) as any);
    return this.findOne(saved.id);
  }

  async update(id: number, dto: Partial<SubconRateCard>) {
    const existing = await this.repo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('街車價目表不存在');
    const { created_at, updated_at, id: _id, subcontractor, client, ...updateData } = dto as any;
    await this.repo.update(id, updateData);
    return this.findOne(id);
  }
}
