import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FleetRateCardsService {
  constructor(private prisma: PrismaService) {}

  private readonly allowedSortFields = [
    'id', 'vehicle_tonnage', 'vehicle_type', 'origin', 'destination',
    'rate', 'day_rate', 'night_rate', 'day_night', 'unit', 'status', 'created_at',
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
        include: { company: true, client: true, source_quotation: true, ot_rates: true },
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
      include: { company: true, client: true, source_quotation: true, ot_rates: true },
    });
    if (!frc) throw new NotFoundException('租賃價目表不存在');
    return frc;
  }

  async create(dto: any) {
    const { client, company, source_quotation, ot_rates, ...data } = dto;
    const saved = await this.prisma.fleetRateCard.create({ data });
    // Handle ot_rates if provided
    if (ot_rates && Array.isArray(ot_rates) && ot_rates.length > 0) {
      for (const otr of ot_rates) {
        await this.prisma.fleetRateCardOtRate.create({
          data: { fleet_rate_card_id: saved.id, time_slot: otr.time_slot, rate: otr.rate, unit: otr.unit },
        });
      }
    }
    return this.findOne(saved.id);
  }

  async update(id: number, dto: any) {
    const existing = await this.prisma.fleetRateCard.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('租賃價目表不存在');
    const { created_at, updated_at, id: _id, client, company, source_quotation, ot_rates, ...updateData } = dto;
    await this.prisma.fleetRateCard.update({ where: { id }, data: updateData });
    // Handle ot_rates update: delete all and re-create
    if (ot_rates !== undefined) {
      await this.prisma.fleetRateCardOtRate.deleteMany({ where: { fleet_rate_card_id: id } });
      if (Array.isArray(ot_rates) && ot_rates.length > 0) {
        for (const otr of ot_rates) {
          await this.prisma.fleetRateCardOtRate.create({
            data: { fleet_rate_card_id: id, time_slot: otr.time_slot, rate: otr.rate, unit: otr.unit },
          });
        }
      }
    }
    return this.findOne(id);
  }

  async findLinkedByRateCard(rateCardId: number) {
    const cards = await this.prisma.fleetRateCard.findMany({
      where: {
        OR: [
          { remarks: { contains: `由客戶價目 #${rateCardId} 自動建立` } },
        ],
      },
      include: { company: true, client: true, source_quotation: true, ot_rates: true },
      orderBy: { id: 'asc' },
    });
    return cards;
  }

  async findOrCreateLinked(rateCardId: number) {
    let cards = await this.findLinkedByRateCard(rateCardId);
    
    if (cards.length === 0) {
      const rc = await this.prisma.rateCard.findUnique({ where: { id: rateCardId } });
      if (rc) {
        const dayNightOptions = ['日', '夜', '中直'];
        
        for (let i = 0; i < dayNightOptions.length; i++) {
          await this.prisma.fleetRateCard.create({
            data: {
              client_id: rc.client_id || null,
              contract_no: rc.contract_no || null,
              day_night: dayNightOptions[i],
              vehicle_tonnage: rc.vehicle_tonnage || null,
              vehicle_type: rc.vehicle_type || null,
              origin: rc.origin || null,
              destination: rc.destination || null,
              rate: 0,
              mid_shift_rate: 0,
              ot_rate: 0,
              unit: rc.unit || rc.day_unit || null,
              remarks: `由客戶價目 #${rateCardId} 自動建立`,
              status: 'active',
            },
          });
        }
        cards = await this.findLinkedByRateCard(rateCardId);
      }
    }
    
    return cards;
  }

  async remove(id: number) {
    const existing = await this.prisma.fleetRateCard.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('租賃價目表不存在');
    await this.prisma.fleetRateCard.delete({ where: { id } });
    return { message: '刪除成功' };
  }

}
