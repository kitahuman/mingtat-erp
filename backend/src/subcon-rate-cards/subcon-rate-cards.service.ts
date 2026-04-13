import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

@Injectable()
export class SubconRateCardsService {
  constructor(
    private prisma: PrismaService,
    private auditLogsService: AuditLogsService,
  ) {}

  private readonly allowedSortFields = [
    'id', 'plate_no', 'tonnage', 'day_night', 'origin', 'destination',
    'rate', 'day_rate', 'unit', 'status', 'created_at',
  ];

  async findAll(query: {
    page?: number; limit?: number; search?: string;
    subcon_id?: number; client_id?: number; tonnage?: string;
    day_night?: string; status?: string;
    sortBy?: string; sortOrder?: string;
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const where: any = {};

    if (query.subcon_id) where.subcon_id = Number(query.subcon_id);
    if (query.client_id) where.client_id = Number(query.client_id);
    if (query.tonnage) where.tonnage = query.tonnage;
    if (query.day_night) where.day_night = query.day_night;
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { plate_no: { contains: query.search, mode: 'insensitive' } },
        { origin: { contains: query.search, mode: 'insensitive' } },
        { destination: { contains: query.search, mode: 'insensitive' } },
        { contract_no: { contains: query.search, mode: 'insensitive' } },
        { remarks: { contains: query.search, mode: 'insensitive' } },
        { subcontractor: { is: { name: { contains: query.search, mode: 'insensitive' } } } },
        { client: { is: { name: { contains: query.search, mode: 'insensitive' } } } },
      ];
    }

    const sortBy = this.allowedSortFields.includes(query.sortBy || '') ? query.sortBy! : 'id';
    const sortOrder = query.sortOrder?.toUpperCase() === 'DESC' ? 'desc' : 'asc';

    const [data, total] = await Promise.all([
      this.prisma.subconRateCard.findMany({
        where,
        include: { company: true, subcontractor: true, client: true, source_quotation: true, ot_rates: true },
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
      include: { company: true, subcontractor: true, client: true, source_quotation: true, ot_rates: true },
    });
    if (!src) throw new NotFoundException('供應商價目表不存在');
    return src;
  }

  private sanitizeForCreate(dto: any) {
    // Strip relation objects and read-only fields
    const { subcontractor, client, company, source_quotation, ot_rates, id, created_at, updated_at, ...data } = dto;

    // Int? fields: convert empty string / falsy to null
    const intFields = ['company_id', 'subcon_id', 'client_id', 'source_quotation_id'];
    for (const f of intFields) {
      data[f] = data[f] !== undefined && data[f] !== '' && data[f] !== null ? Number(data[f]) : null;
      if (data[f] !== null && isNaN(data[f])) data[f] = null;
    }

    // Decimal fields: convert to number, default 0
    const decimalFields = ['rate', 'day_rate', 'night_rate', 'mid_shift_rate', 'ot_rate'];
    for (const f of decimalFields) {
      data[f] = data[f] !== undefined && data[f] !== '' ? Number(data[f]) : 0;
      if (isNaN(data[f])) data[f] = 0;
    }

    // DateTime? fields: convert empty string to null
    const dateFields = ['effective_date', 'expiry_date'];
    for (const f of dateFields) {
      data[f] = data[f] && data[f] !== '' ? new Date(data[f]) : null;
    }

    // Boolean fields
    if (typeof data.exclude_fuel !== 'boolean') {
      data.exclude_fuel = data.exclude_fuel === 'true' || data.exclude_fuel === true || data.exclude_fuel === 1;
    }

    // String? fields: convert empty string / undefined to null
    const strOptionals = [
      'plate_no', 'contract_no', 'client_contract_no', 'service_type', 'name',
      'description', 'day_night', 'tonnage', 'machine_type', 'equipment_number',
      'origin', 'destination', 'unit', 'day_unit', 'night_unit', 'mid_shift_unit',
      'ot_unit', 'remarks', 'status',
    ];
    for (const f of strOptionals) {
      if (data[f] === '' || data[f] === undefined) data[f] = null;
    }
    // status defaults to 'active' if null
    if (!data.status) data.status = 'active';

    // Remove any unknown extra fields that may cause Prisma errors
    const allowedFields = new Set([
      'company_id', 'subcon_id', 'plate_no', 'client_id', 'contract_no',
      'client_contract_no', 'service_type', 'name', 'description', 'day_night',
      'tonnage', 'machine_type', 'equipment_number', 'origin', 'destination',
      'rate', 'day_rate', 'day_unit', 'night_rate', 'night_unit',
      'mid_shift_rate', 'mid_shift_unit', 'ot_rate', 'ot_unit', 'unit',
      'exclude_fuel', 'effective_date', 'expiry_date', 'remarks',
      'source_quotation_id', 'status',
    ]);
    for (const key of Object.keys(data)) {
      if (!allowedFields.has(key)) delete data[key];
    }

    return { data, ot_rates };
  }

  async create(dto: any, userId?: number, ipAddress?: string) {
    const { data, ot_rates } = this.sanitizeForCreate(dto);

    // effective_date is required on create
    if (!data.effective_date) {
      throw new BadRequestException('生效日期為必填欄位');
    }

    const saved = await this.prisma.subconRateCard.create({ data });
    if (ot_rates && Array.isArray(ot_rates) && ot_rates.length > 0) {
      for (const otr of ot_rates) {
        await this.prisma.subconRateCardOtRate.create({
          data: { subcon_rate_card_id: saved.id, time_slot: otr.time_slot, rate: Number(otr.rate) || 0, unit: otr.unit || null },
        });
      }
    }

    // Audit log
    if (userId) {
      try {
        await this.auditLogsService.log({
          userId,
          action: 'create',
          targetTable: 'subcon_rate_cards',
          targetId: saved.id,
          changesAfter: saved,
          ipAddress,
        });
      } catch (e) { console.error('Audit log error:', e); }
    }

    return this.findOne(saved.id);
  }

  async update(id: number, dto: any, userId?: number, ipAddress?: string) {
    const existing = await this.prisma.subconRateCard.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('供應商價目表不存在');
    const { created_at, updated_at, id: _id, subcontractor, client, company, source_quotation, ot_rates, ...updateData } = dto;
    const updated = await this.prisma.subconRateCard.update({ where: { id }, data: updateData });
    if (ot_rates !== undefined) {
      await this.prisma.subconRateCardOtRate.deleteMany({ where: { subcon_rate_card_id: id } });
      if (Array.isArray(ot_rates) && ot_rates.length > 0) {
        for (const otr of ot_rates) {
          await this.prisma.subconRateCardOtRate.create({
            data: { subcon_rate_card_id: id, time_slot: otr.time_slot, rate: otr.rate, unit: otr.unit },
          });
        }
      }
    }

    // Audit log
    if (userId) {
      try {
        await this.auditLogsService.log({
          userId,
          action: 'update',
          targetTable: 'subcon_rate_cards',
          targetId: id,
          changesBefore: existing,
          changesAfter: updated,
          ipAddress,
        });
      } catch (e) { console.error('Audit log error:', e); }
    }

    return this.findOne(id);
  }

  async remove(id: number, userId?: number, ipAddress?: string) {
    const existing = await this.prisma.subconRateCard.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('供應商價目表不存在');

    // Audit log before deletion
    if (userId) {
      try {
        await this.auditLogsService.log({
          userId,
          action: 'delete',
          targetTable: 'subcon_rate_cards',
          targetId: id,
          changesBefore: existing,
          ipAddress,
        });
      } catch (e) { console.error('Audit log error:', e); }
    }

    await this.prisma.subconRateCard.delete({ where: { id } });
    return { message: '刪除成功' };
  }

}
