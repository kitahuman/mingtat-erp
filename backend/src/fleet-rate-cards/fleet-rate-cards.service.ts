import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FleetRateCard } from './fleet-rate-card.entity';

@Injectable()
export class FleetRateCardsService {
  constructor(
    @InjectRepository(FleetRateCard) private repo: Repository<FleetRateCard>,
  ) {}

  private readonly allowedSortFields = [
    'id', 'vehicle_tonnage', 'vehicle_type', 'origin', 'destination',
    'day_rate', 'night_rate', 'unit', 'status', 'created_at',
  ];

  async findAll(query: {
    page?: number; limit?: number; search?: string;
    client_id?: number; vehicle_tonnage?: string; vehicle_type?: string;
    status?: string; sortBy?: string; sortOrder?: string;
  }) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const qb = this.repo.createQueryBuilder('frc')
      .leftJoinAndSelect('frc.client', 'client');

    if (query.search) {
      qb.andWhere(
        '(frc.origin ILIKE :s OR frc.destination ILIKE :s OR frc.contract_no ILIKE :s OR frc.remarks ILIKE :s OR client.name ILIKE :s)',
        { s: `%${query.search}%` },
      );
    }
    if (query.client_id) qb.andWhere('frc.client_id = :clid', { clid: query.client_id });
    if (query.vehicle_tonnage) qb.andWhere('frc.vehicle_tonnage = :vt', { vt: query.vehicle_tonnage });
    if (query.vehicle_type) qb.andWhere('frc.vehicle_type = :vtp', { vtp: query.vehicle_type });
    if (query.status) qb.andWhere('frc.status = :status', { status: query.status });

    const sortBy = this.allowedSortFields.includes(query.sortBy || '') ? query.sortBy! : 'id';
    const sortOrder = (query.sortOrder?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC') as 'ASC' | 'DESC';
    qb.orderBy(`frc.${sortBy}`, sortOrder);

    const [data, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number) {
    const frc = await this.repo.findOne({
      where: { id },
      relations: ['client'],
    });
    if (!frc) throw new NotFoundException('車隊價目表不存在');
    return frc;
  }

  async create(dto: Partial<FleetRateCard>) {
    const entity = this.repo.create(dto);
    const saved: FleetRateCard = await (this.repo.save(entity) as any);
    return this.findOne(saved.id);
  }

  async update(id: number, dto: Partial<FleetRateCard>) {
    const existing = await this.repo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('車隊價目表不存在');
    const { created_at, updated_at, id: _id, client, ...updateData } = dto as any;
    await this.repo.update(id, updateData);
    return this.findOne(id);
  }
}
