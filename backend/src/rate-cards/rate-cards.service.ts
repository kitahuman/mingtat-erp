import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RateCardsService {
  constructor(private prisma: PrismaService) {}

  private readonly allowedSortFields = [
    'id', 'name', 'service_type', 'vehicle_tonnage', 'vehicle_type',
    'origin', 'destination', 'day_rate', 'night_rate', 'status',
    'effective_date', 'expiry_date', 'created_at',
  ];

  async findAll(query: {
    page?: number; limit?: number; search?: string;
    company_id?: number; client_id?: number; service_type?: string;
    vehicle_tonnage?: string; vehicle_type?: string; status?: string;
    rate_card_type?: string;
    project_id?: number; source_quotation_id?: number;
    sortBy?: string; sortOrder?: string;
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const where: any = {};

    if (query.company_id) where.company_id = Number(query.company_id);
    if (query.client_id) where.client_id = Number(query.client_id);
    if (query.service_type) where.service_type = query.service_type;
    if (query.vehicle_tonnage) where.vehicle_tonnage = query.vehicle_tonnage;
    if (query.vehicle_type) where.vehicle_type = query.vehicle_type;
    if (query.status) where.status = query.status;
    if (query.rate_card_type) where.rate_card_type = query.rate_card_type;
    if (query.project_id) where.project_id = Number(query.project_id);
    if (query.source_quotation_id) where.source_quotation_id = Number(query.source_quotation_id);
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
        { origin: { contains: query.search, mode: 'insensitive' } },
        { destination: { contains: query.search, mode: 'insensitive' } },
        { contract_no: { contains: query.search, mode: 'insensitive' } },
        { client: { name: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const sortBy = this.allowedSortFields.includes(query.sortBy || '') ? query.sortBy! : 'id';
    const sortOrder = query.sortOrder?.toUpperCase() === 'DESC' ? 'desc' : 'asc';

    const [data, total] = await Promise.all([
      this.prisma.rateCard.findMany({
        where,
        include: { company: true, client: true, source_quotation: true, project: true },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.rateCard.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number) {
    const rc = await this.prisma.rateCard.findUnique({
      where: { id },
      include: { company: true, client: true, ot_rates: true, source_quotation: true, project: true },
    });
    if (!rc) throw new NotFoundException('價目表不存在');
    return rc;
  }

  async create(dto: any) {
    const { ot_rates, company, client, source_quotation, project, ...data } = dto;
    if (data.effective_date) data.effective_date = new Date(data.effective_date);
    if (data.expiry_date) data.expiry_date = new Date(data.expiry_date);

    const saved = await this.prisma.rateCard.create({
      data: {
        ...data,
        ot_rates: ot_rates?.length ? {
          create: ot_rates.map((ot: any) => ({
            time_slot: ot.time_slot,
            rate: ot.rate,
            unit: ot.unit,
          })),
        } : undefined,
      },
    });

    // Three-table linkage: when creating a customer rate card (rental type),
    // auto-create corresponding items in fleet and subcon rate cards with empty prices
    if (!data.rate_card_type || data.rate_card_type === 'rental') {
      try {
        // Create fleet rate card (rental/internal cost) with same item info but zero prices
        await this.prisma.fleetRateCard.create({
          data: {
            client_id: data.client_id || null,
            contract_no: data.contract_no || null,
            vehicle_tonnage: data.vehicle_tonnage || null,
            vehicle_type: data.vehicle_type || null,
            origin: data.origin || null,
            destination: data.destination || null,
            day_rate: 0,
            night_rate: 0,
            mid_shift_rate: 0,
            ot_rate: 0,
            unit: data.day_unit || null,
            remarks: `由客戶價目 #${saved.id} 自動建立`,
            status: 'active',
          },
        });

        // Create subcon rate card (supplier cost) with same item info but zero prices
        await this.prisma.subconRateCard.create({
          data: {
            client_id: data.client_id || null,
            contract_no: data.contract_no || null,
            vehicle_tonnage: data.vehicle_tonnage || null,
            origin: data.origin || null,
            destination: data.destination || null,
            day_rate: 0,
            unit: data.day_unit || null,
            remarks: `由客戶價目 #${saved.id} 自動建立`,
            status: 'active',
          },
        });
      } catch (linkErr) {
        // Log but don't fail the main creation
        console.error('Three-table linkage error:', linkErr);
      }
    }

    return this.findOne(saved.id);
  }

  async update(id: number, dto: any) {
    const existing = await this.prisma.rateCard.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('價目表不存在');

    const { ot_rates, company, client, source_quotation, project, created_at, updated_at, id: _id, ...updateData } = dto;
    if (updateData.effective_date) updateData.effective_date = new Date(updateData.effective_date);
    if (updateData.expiry_date) updateData.expiry_date = new Date(updateData.expiry_date);

    await this.prisma.rateCard.update({ where: { id }, data: updateData });

    if (ot_rates !== undefined) {
      await this.prisma.rateCardOtRate.deleteMany({ where: { rate_card_id: id } });
      if (ot_rates.length > 0) {
        await this.prisma.rateCardOtRate.createMany({
          data: ot_rates.map((ot: any) => ({
            rate_card_id: id,
            time_slot: ot.time_slot,
            rate: ot.rate,
            unit: ot.unit,
          })),
        });
      }
    }

    return this.findOne(id);
  }

  async remove(id: number) {
    const existing = await this.prisma.rateCard.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('價目表不存在');
    await this.prisma.rateCard.delete({ where: { id } });
    return { message: '刪除成功' };
  }

}