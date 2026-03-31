import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Vehicle } from './vehicle.entity';
import { VehiclePlateHistory } from './vehicle-plate-history.entity';
import { VehicleTransfer } from './vehicle-transfer.entity';

@Injectable()
export class VehiclesService {
  constructor(
    @InjectRepository(Vehicle) private repo: Repository<Vehicle>,
    @InjectRepository(VehiclePlateHistory) private plateRepo: Repository<VehiclePlateHistory>,
    @InjectRepository(VehicleTransfer) private transferRepo: Repository<VehicleTransfer>,
  ) {}

  async findAll(query: {
    page?: number; limit?: number; search?: string;
    vehicle_type?: string; owner_company_id?: number; status?: string;
    sortBy?: string; sortOrder?: string;
  }) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const qb = this.repo.createQueryBuilder('v')
      .leftJoinAndSelect('v.owner_company', 'c');

    if (query.search) {
      qb.andWhere('(v.plate_number ILIKE :s OR v.brand ILIKE :s OR v.model ILIKE :s)', { s: `%${query.search}%` });
    }
    if (query.vehicle_type) qb.andWhere('v.vehicle_type = :vt', { vt: query.vehicle_type });
    if (query.owner_company_id) qb.andWhere('v.owner_company_id = :cid', { cid: query.owner_company_id });
    if (query.status) qb.andWhere('v.status = :st', { st: query.status });

    const allowedSortFields = ['plate_number', 'vehicle_type', 'tonnage', 'insurance_expiry', 'permit_fee_expiry', 'inspection_date', 'license_expiry', 'status', 'id'];
    const sortBy = allowedSortFields.includes(query.sortBy || '') ? query.sortBy! : 'id';
    const sortOrder = (query.sortOrder?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC') as 'ASC' | 'DESC';
    qb.orderBy(`v.${sortBy}`, sortOrder);

    const [data, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number) {
    const vehicle = await this.repo.findOne({
      where: { id },
      relations: ['owner_company', 'plate_history', 'transfers', 'transfers.from_company', 'transfers.to_company'],
    });
    if (!vehicle) throw new NotFoundException('車輛不存在');
    return vehicle;
  }

  async create(dto: Partial<Vehicle>) {
    const entity = this.repo.create(dto);
    return this.repo.save(entity);
  }

  async update(id: number, dto: Partial<Vehicle>) {
    const { plate_history, transfers, owner_company, ...updateData } = dto as any;
    await this.repo.update(id, updateData);
    return this.findOne(id);
  }

  async changePlate(id: number, dto: { new_plate: string; change_date: string; notes?: string }) {
    const vehicle = await this.repo.findOne({ where: { id } });
    if (!vehicle) throw new NotFoundException('車輛不存在');
    const history = this.plateRepo.create({
      vehicle_id: id,
      old_plate: vehicle.plate_number,
      new_plate: dto.new_plate,
      change_date: dto.change_date,
      notes: dto.notes,
    });
    await this.plateRepo.save(history);
    await this.repo.update(id, { plate_number: dto.new_plate });
    return this.findOne(id);
  }

  async transferVehicle(id: number, dto: { from_company_id: number; to_company_id: number; transfer_date: string; notes?: string }) {
    const transfer = this.transferRepo.create({ ...dto, vehicle_id: id });
    await this.transferRepo.save(transfer);
    await this.repo.update(id, { owner_company_id: dto.to_company_id });
    return this.findOne(id);
  }
}
