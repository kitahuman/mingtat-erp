import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FleetRateCardsService {
  constructor(private prisma: PrismaService) {}

  private readonly allowedSortFields = [
    'id', 'vehicle_tonnage', 'vehicle_type', 'origin', 'destination',
    'day_rate', 'night_rate', 'unit', 'status', 'created_at',
  ];

  async findAll(query: {
    page?: number; limit?: number; search?: string;
    client_id?: number; vehicle_tonnage?: string; vehicle_type?: string;
    status?: string; sortBy?: string; sortOrder?: string;
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const where: any = {};

    if (query.client_id) where.client_id = Number(query.client_id);
    if (query.vehicle_tonnage) where.vehicle_tonnage = query.vehicle_tonnage;
    if (query.vehicle_type) where.vehicle_type = query.vehicle_type;
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { origin: { contains: query.search, mode: 'insensitive' } },
        { destination: { contains: query.search, mode: 'insensitive' } },
        { contract_no: { contains: query.search, mode: 'insensitive' } },
        { remarks: { contains: query.search, mode: 'insensitive' } },
        { client: { name: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const sortBy = this.allowedSortFields.includes(query.sortBy || '') ? query.sortBy! : 'id';
    const sortOrder = query.sortOrder?.toUpperCase() === 'DESC' ? 'desc' : 'asc';

    const [data, total] = await Promise.all([
      this.prisma.fleetRateCard.findMany({
        where,
        include: { client: true, source_quotation: true },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.fleetRateCard.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number) {
    const frc = await this.prisma.fleetRateCard.findUnique({
      where: { id },
      include: { client: true, source_quotation: true },
    });
    if (!frc) throw new NotFoundException('租賃價目表不存在');
    return frc;
  }

  async create(dto: any) {
    const { client, source_quotation, ...data } = dto;
    const saved = await this.prisma.fleetRateCard.create({ data });
    return this.findOne(saved.id);
  }

  async update(id: number, dto: any) {
    const existing = await this.prisma.fleetRateCard.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('租賃價目表不存在');
    const { created_at, updated_at, id: _id, client, source_quotation, ...updateData } = dto;
    await this.prisma.fleetRateCard.update({ where: { id }, data: updateData });
    return this.findOne(id);
  }

  async remove(id: number) {
    const existing = await this.prisma.fleetRateCard.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('租賃價目表不存在');
    await this.prisma.fleetRateCard.delete({ where: { id } });
    return { message: '刪除成功' };
  }

}