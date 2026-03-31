import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Machinery } from './machinery.entity';
import { MachineryTransfer } from './machinery-transfer.entity';

@Injectable()
export class MachineryService {
  constructor(
    @InjectRepository(Machinery) private repo: Repository<Machinery>,
    @InjectRepository(MachineryTransfer) private transferRepo: Repository<MachineryTransfer>,
  ) {}

  async findAll(query: {
    page?: number; limit?: number; search?: string;
    machine_type?: string; owner_company_id?: number; status?: string;
    sortBy?: string; sortOrder?: string;
  }) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const qb = this.repo.createQueryBuilder('m')
      .leftJoinAndSelect('m.owner_company', 'c');

    if (query.search) {
      qb.andWhere('(m.machine_code ILIKE :s OR m.brand ILIKE :s OR m.model ILIKE :s OR m.serial_number ILIKE :s)', { s: `%${query.search}%` });
    }
    if (query.machine_type) qb.andWhere('m.machine_type = :mt', { mt: query.machine_type });
    if (query.owner_company_id) qb.andWhere('m.owner_company_id = :cid', { cid: query.owner_company_id });
    if (query.status) qb.andWhere('m.status = :st', { st: query.status });

    const allowedSortFields = ['machine_code', 'machine_type', 'brand', 'model', 'tonnage', 'inspection_cert_expiry', 'insurance_expiry', 'status', 'id'];
    const sortBy = allowedSortFields.includes(query.sortBy || '') ? query.sortBy! : 'machine_code';
    const sortOrder = (query.sortOrder?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC') as 'ASC' | 'DESC';
    qb.orderBy(`m.${sortBy}`, sortOrder);

    const [data, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number) {
    const machinery = await this.repo.findOne({
      where: { id },
      relations: ['owner_company', 'transfers', 'transfers.from_company', 'transfers.to_company'],
    });
    if (!machinery) throw new NotFoundException('機械不存在');
    return machinery;
  }

  async create(dto: Partial<Machinery>) {
    const entity = this.repo.create(dto);
    return this.repo.save(entity);
  }

  async update(id: number, dto: Partial<Machinery>) {
    const { transfers, owner_company, ...updateData } = dto as any;
    await this.repo.update(id, updateData);
    return this.findOne(id);
  }

  async transferMachinery(id: number, dto: { from_company_id: number; to_company_id: number; transfer_date: string; notes?: string }) {
    const transfer = this.transferRepo.create({ ...dto, machinery_id: id });
    await this.transferRepo.save(transfer);
    await this.repo.update(id, { owner_company_id: dto.to_company_id });
    return this.findOne(id);
  }
}
