import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

@Injectable()
export class RateCardsService {
  constructor(
    private prisma: PrismaService,
    private auditLogsService: AuditLogsService,
  ) {}

  private readonly allowedSortFields = [
    'id', 'name', 'service_type', 'tonnage', 'machine_type',
    'origin', 'destination', 'rate', 'day_rate', 'night_rate', 'day_night', 'status',
    'effective_date', 'expiry_date', 'created_at',
  ];

  async findAll(query: {
    page?: number; limit?: number; search?: string;
    company_id?: number; client_id?: number; service_type?: string;
    tonnage?: string; machine_type?: string; status?: string;
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
    if (query.tonnage) where.tonnage = query.tonnage;
    if (query.machine_type) where.machine_type = query.machine_type;
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
        { client: { is: { name: { contains: query.search, mode: 'insensitive' } } } },
      ];
    }

    const sortBy = this.allowedSortFields.includes(query.sortBy || '') ? query.sortBy! : 'id';
    const sortOrder = query.sortOrder?.toUpperCase() === 'DESC' ? 'desc' : 'asc';

    try {
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
    } catch (err: any) {
      console.error('[RateCards.findAll] ERROR:', err?.message);
      console.error('[RateCards.findAll] CODE:', err?.code);
      console.error('[RateCards.findAll] META:', JSON.stringify(err?.meta));
      console.error('[RateCards.findAll] STACK:', err?.stack?.split('\n').slice(0, 5).join('\n'));
      throw err;
    }
  }

  async findOne(id: number) {
    const rc = await this.prisma.rateCard.findUnique({
      where: { id },
      include: { company: true, client: true, ot_rates: true, source_quotation: true, project: true },
    });
    if (!rc) throw new NotFoundException('價目表不存在');
    return rc;
  }

  async create(dto: any, userId?: number) {
    const { ot_rates, company, client, source_quotation, project, ...data } = dto;

    // effective_date is required on create
    if (!data.effective_date) {
      throw new BadRequestException('生效日期為必填欄位');
    }

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
            day_night: data.day_night || null,
            tonnage: data.tonnage || null,
            machine_type: data.machine_type || null,
            origin: data.origin || null,
            destination: data.destination || null,
            rate: 0,
            mid_shift_rate: 0,
            ot_rate: 0,
            unit: data.unit || null,
            remarks: `由客戶價目 #${saved.id} 自動建立`,
            status: 'active',
          },
        });

        // Create subcon rate card (supplier cost) with same item info but zero prices
        await this.prisma.subconRateCard.create({
          data: {
            client_id: data.client_id || null,
            contract_no: data.contract_no || null,
            day_night: data.day_night || null,
            tonnage: data.tonnage || null,
            origin: data.origin || null,
            destination: data.destination || null,
            rate: 0,
            unit: data.unit || null,
            remarks: `由客戶價目 #${saved.id} 自動建立`,
            status: 'active',
          },
        });
      } catch (linkErr) {
        // Log but don't fail the main creation
        console.error('Three-table linkage error:', linkErr);
      }
    }

    // Audit log
    if (userId) {
      try {
        await this.auditLogsService.log({
          userId,
          action: 'create',
          targetTable: 'rate_cards',
          targetId: saved.id,
          changesAfter: saved,
        });
      } catch (e) { console.error('Audit log error:', e); }
    }

    return this.findOne(saved.id);
  }

  async update(id: number, dto: any, userId?: number) {
    const existing = await this.prisma.rateCard.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('價目表不存在');

    const { ot_rates, company, client, source_quotation, project, created_at, updated_at, id: _id, ...updateData } = dto;
    if (updateData.effective_date) updateData.effective_date = new Date(updateData.effective_date);
    if (updateData.expiry_date) updateData.expiry_date = new Date(updateData.expiry_date);

    const updated = await this.prisma.rateCard.update({ where: { id }, data: updateData });

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

    // Audit log
    if (userId) {
      try {
        await this.auditLogsService.log({
          userId,
          action: 'update',
          targetTable: 'rate_cards',
          targetId: id,
          changesBefore: existing,
          changesAfter: updated,
        });
      } catch (e) { console.error('Audit log error:', e); }
    }

    return this.findOne(id);
  }

  async remove(id: number, userId?: number) {
    const existing = await this.prisma.rateCard.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('價目表不存在');

    // Audit log before deletion
    if (userId) {
      try {
        await this.auditLogsService.log({
          userId,
          action: 'delete',
          targetTable: 'rate_cards',
          targetId: id,
          changesBefore: existing,
        });
      } catch (e) { console.error('Audit log error:', e); }
    }

    await this.prisma.rateCard.delete({ where: { id } });
    return { message: '刪除成功' };
  }

}
