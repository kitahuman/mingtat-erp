import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class VehiclesService {
  constructor(private prisma: PrismaService) {}

  async simple() {
    const vehicles = await this.prisma.vehicle.findMany({
      where: { status: 'active' },
      select: { id: true, plate_number: true, machine_type: true, tonnage: true },
      orderBy: { plate_number: 'asc' },
    });
    return vehicles.map(v => ({
      value: v.plate_number,
      label: v.plate_number,
      type: v.machine_type,
      tonnage: v.tonnage ? String(v.tonnage) : null,
      category: 'vehicle',
    }));
  }

  async findAll(query: {
    page?: number; limit?: number; search?: string;
    machine_type?: string; owner_company_id?: number; status?: string;
    sortBy?: string; sortOrder?: string;
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const where: any = {};

    if (query.machine_type) where.machine_type = query.machine_type;
    if (query.owner_company_id) where.owner_company_id = Number(query.owner_company_id);
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { plate_number: { contains: query.search, mode: 'insensitive' } },
        { brand: { contains: query.search, mode: 'insensitive' } },
        { model: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const allowedSortFields = ['plate_number', 'machine_type', 'tonnage', 'brand', 'model', 'insurance_expiry', 'permit_fee_expiry', 'inspection_date', 'license_expiry', 'status', 'id', 'created_at'];
    const sortBy = allowedSortFields.includes(query.sortBy || '') ? query.sortBy! : 'id';
    const sortOrder = query.sortOrder?.toUpperCase() === 'DESC' ? 'desc' : 'asc';

    const [data, total] = await Promise.all([
      this.prisma.vehicle.findMany({
        where,
        include: { owner_company: true },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.vehicle.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id },
      include: {
        owner_company: true,
        plate_history: { orderBy: { change_date: 'desc' } },
        transfers: {
          include: { from_company: true, to_company: true },
          orderBy: { transfer_date: 'desc' },
        },
      },
    });
    if (!vehicle) throw new NotFoundException('車輛不存在');
    return vehicle;
  }

  async create(dto: any) {
    const { owner_company, plate_history, transfers, ...data } = dto;
    const saved = await this.prisma.vehicle.create({ data });
    return this.findOne(saved.id);
  }

  async update(id: number, dto: any) {
    const existing = await this.prisma.vehicle.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('車輛不存在');
    const { plate_history, transfers, owner_company, created_at, updated_at, id: _id, ...updateData } = dto;
    await this.prisma.vehicle.update({ where: { id }, data: updateData });
    return this.findOne(id);
  }

  async changePlate(id: number, dto: { new_plate: string; change_date: string; notes?: string }) {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id } });
    if (!vehicle) throw new NotFoundException('車輛不存在');

    await this.prisma.vehiclePlateHistory.create({
      data: {
        vehicle_id: id,
        old_plate: vehicle.plate_number,
        new_plate: dto.new_plate,
        change_date: new Date(dto.change_date),
        notes: dto.notes,
      },
    });

    await this.prisma.vehicle.update({
      where: { id },
      data: { plate_number: dto.new_plate },
    });

    return this.findOne(id);
  }

  async transferVehicle(id: number, dto: { from_company_id: number; to_company_id: number; transfer_date: string; notes?: string }) {
    await this.prisma.vehicleTransfer.create({
      data: {
        vehicle_id: id,
        from_company_id: dto.from_company_id,
        to_company_id: dto.to_company_id,
        transfer_date: new Date(dto.transfer_date),
        notes: dto.notes,
      },
    });
    await this.prisma.vehicle.update({
      where: { id },
      data: { owner_company_id: dto.to_company_id },
    });
    return this.findOne(id);
  }

  async remove(id: number) {
    const existing = await this.prisma.vehicle.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('車輛不存在');
    await this.prisma.vehicle.delete({ where: { id } });
    return { message: '刪除成功' };
  }

}