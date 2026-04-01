import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SubconRateCardsService {
  constructor(private prisma: PrismaService) {}

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
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const where: any = {};

    if (query.subcon_id) where.subcon_id = Number(query.subcon_id);
    if (query.client_id) where.client_id = Number(query.client_id);
    if (query.vehicle_tonnage) where.vehicle_tonnage = query.vehicle_tonnage;
    if (query.day_night) where.day_night = query.day_night;
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { plate_no: { contains: query.search, mode: 'insensitive' } },
        { origin: { contains: query.search, mode: 'insensitive' } },
        { destination: { contains: query.search, mode: 'insensitive' } },
        { contract_no: { contains: query.search, mode: 'insensitive' } },
        { remarks: { contains: query.search, mode: 'insensitive' } },
        { subcontractor: { name: { contains: query.search, mode: 'insensitive' } } },
        { client: { name: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const sortBy = this.allowedSortFields.includes(query.sortBy || '') ? query.sortBy! : 'id';
    const sortOrder = query.sortOrder?.toUpperCase() === 'DESC' ? 'desc' : 'asc';

    const [data, total] = await Promise.all([
      this.prisma.subconRateCard.findMany({
        where,
        include: { subcontractor: true, client: true, source_quotation: true },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.subconRateCard.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number) {
    const src = await this.prisma.subconRateCard.findUnique({
      where: { id },
      include: { subcontractor: true, client: true, source_quotation: true },
    });
    if (!src) throw new NotFoundException('街車價目表不存在');
    return src;
  }

  async create(dto: any) {
    const { subcontractor, client, source_quotation, ...data } = dto;
    const saved = await this.prisma.subconRateCard.create({ data });
    return this.findOne(saved.id);
  }

  async update(id: number, dto: any) {
    const existing = await this.prisma.subconRateCard.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('街車價目表不存在');
    const { created_at, updated_at, id: _id, subcontractor, client, source_quotation, ...updateData } = dto;
    await this.prisma.subconRateCard.update({ where: { id }, data: updateData });
    return this.findOne(id);
  }

  async remove(id: number) {
    const existing = await this.prisma.subconRateCard.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('街車價目表不存在');
    await this.prisma.subconRateCard.delete({ where: { id } });
    return { message: '刪除成功' };
  }

}