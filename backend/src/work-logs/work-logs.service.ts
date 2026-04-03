import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// 車輛類機種
const VEHICLE_TYPES = ['平斗', '勾斗', '夾斗', '拖頭', '車斗', '貨車', '輕型貨車', '私家車', '燈車'];
// 機械類機種
const MACHINERY_TYPES = ['挖掘機', '火轆'];

@Injectable()
export class WorkLogsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── 工作記錄 CRUD ─────────────────────────────────────────

  async findAll(query: any) {
    const {
      page = 1,
      limit = 25,
      publisher_id,
      status,
      company_profile_id,
      client_id,
      quotation_id,
      contract_id,
      employee_id,
      equipment_number,
      date_from,
      date_to,
      sortBy = 'scheduled_date',
      sortOrder = 'DESC',
    } = query;

    const where: any = {};
    if (publisher_id) where.publisher_id = Number(publisher_id);
    if (status) where.status = status;
    if (company_profile_id) where.company_profile_id = Number(company_profile_id);
    if (client_id) where.client_id = Number(client_id);
    if (quotation_id) where.quotation_id = Number(quotation_id);
    if (contract_id) where.contract_id = Number(contract_id);
    if (employee_id) where.employee_id = Number(employee_id);
    if (query.project_id) where.project_id = Number(query.project_id);
    if (equipment_number) where.equipment_number = { contains: equipment_number, mode: 'insensitive' };
    if (date_from || date_to) {
      where.scheduled_date = {};
      if (date_from) where.scheduled_date.gte = new Date(date_from);
      if (date_to) where.scheduled_date.lte = new Date(date_to);
    }

    const allowedSort = [
      'id', 'scheduled_date', 'status', 'service_type',
      'machine_type', 'equipment_number', 'day_night', 'created_at',
    ];
    const safeSortBy = allowedSort.includes(sortBy) ? sortBy : 'scheduled_date';
    const safeSortOrder = sortOrder === 'ASC' ? 'asc' : 'desc';

    const pg = Number(page);
    const lm = Number(limit);

    const [data, total] = await Promise.all([
      this.prisma.workLog.findMany({
        where,
        include: {
          publisher: true,
          company_profile: true,
          client: true,
          quotation: true,
          contract: true,
          employee: true,
          project: true,
        },
        orderBy: { [safeSortBy]: safeSortOrder },
        skip: (pg - 1) * lm,
        take: lm,
      }),
      this.prisma.workLog.count({ where }),
    ]);

    return { data, total, page: pg, limit: lm, totalPages: Math.ceil(total / lm) };
  }

  async findOne(id: number) {
    return this.prisma.workLog.findUnique({
      where: { id },
      include: {
        publisher: true,
        company_profile: true,
        client: true,
        quotation: true,
        contract: true,
        employee: true,
        project: true,
      },
    });
  }

  async create(dto: any, userId: number) {
    const { publisher, company_profile, client, quotation, contract, employee, project, payroll_work_logs, matched_rate_card, rate_card, ...data } = dto;
    const saved = await this.prisma.workLog.create({
      data: {
        ...data,
        publisher_id: data.publisher_id ?? userId,
        equipment_source: this.resolveEquipmentSource(data.machine_type),
        scheduled_date: data.scheduled_date ? new Date(data.scheduled_date) : undefined,
      },
    });
    // 自動匹配價格
    await this.matchAndSavePrice(saved);
    return this.findOne(saved.id);
  }

  async update(id: number, dto: any) {
    // Strip all relation objects and metadata to avoid Prisma errors
    const {
      id: _id, created_at, updated_at,
      publisher, company_profile, client, quotation, contract, employee,
      project, payroll_work_logs,
      matched_rate_card, rate_card,
      ...rest
    } = dto;
    if (rest.machine_type !== undefined) {
      rest.equipment_source = this.resolveEquipmentSource(rest.machine_type);
    }
    if (rest.scheduled_date) rest.scheduled_date = new Date(rest.scheduled_date);

    // Remove any remaining nested objects that Prisma cannot handle
    for (const key of Object.keys(rest)) {
      if (rest[key] !== null && typeof rest[key] === 'object' && !(rest[key] instanceof Date) && !Array.isArray(rest[key])) {
        delete rest[key];
      }
    }

    await this.prisma.workLog.update({ where: { id }, data: rest });
    // 自動匹配價格（如果關鍵欄位有變動）
    const priceRelatedFields = ['client_id', 'company_profile_id', 'quotation_id', 'contract_id', 'machine_type', 'tonnage', 'day_night', 'start_location', 'end_location'];
    const hasPriceChange = priceRelatedFields.some(f => f in rest);
    if (hasPriceChange) {
      const updated = await this.findOne(id);
      if (updated) {
        await this.matchAndSavePrice(updated as any);
      }
    }
    return this.findOne(id);
  }

  async remove(id: number) {
    await this.prisma.workLog.delete({ where: { id } });
    return { success: true };
  }

  async bulkDelete(ids: number[]) {
    await this.prisma.workLog.deleteMany({ where: { id: { in: ids } } });
    return { success: true, deleted: ids.length };
  }

  async bulkConfirm(ids: number[]) {
    await this.prisma.workLog.updateMany({ where: { id: { in: ids } }, data: { is_confirmed: true } });
    return { success: true, confirmed: ids.length };
  }

  async bulkUnconfirm(ids: number[]) {
    await this.prisma.workLog.updateMany({ where: { id: { in: ids } }, data: { is_confirmed: false } });
    return { success: true, unconfirmed: ids.length };
  }

  async duplicate(id: number, userId: number) {
    const original = await this.prisma.workLog.findUnique({ where: { id } });
    if (!original) throw new Error('WorkLog not found');
    const copy = await this.prisma.workLog.create({
      data: {
        status: 'editing',
        service_type: original.service_type,
        scheduled_date: original.scheduled_date,
        company_profile_id: original.company_profile_id,
        client_id: original.client_id,
        quotation_id: original.quotation_id,
        contract_id: original.contract_id,
        employee_id: original.employee_id,
        machine_type: original.machine_type,
        equipment_number: original.equipment_number,
        equipment_source: original.equipment_source,
        tonnage: original.tonnage,
        day_night: original.day_night,
        start_location: original.start_location,
        start_time: original.start_time,
        end_location: original.end_location,
        end_time: original.end_time,
        quantity: original.quantity,
        unit: original.unit,
        ot_quantity: original.ot_quantity,
        ot_unit: original.ot_unit,
        goods_quantity: original.goods_quantity,
        remarks: original.remarks,
        publisher_id: userId,
        is_confirmed: false,
        is_paid: false,
      },
    });
    await this.matchAndSavePrice(copy);
    return this.findOne(copy.id);
  }

  // ── 地點自動完成 ─────────────────────────────────────────

  async getLocationSuggestions(type: 'start' | 'end', q: string) {
    const field = type === 'start' ? 'start_location' : 'end_location';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results: any[] = await (this.prisma.$queryRawUnsafe as any)(
      `SELECT DISTINCT "${field}" AS location FROM work_logs WHERE "${field}" ILIKE $1 AND "${field}" IS NOT NULL AND "${field}" != '' ORDER BY location ASC LIMIT 20`,
      `%${q}%`,
    );
    return results.map((r: { location: string }) => r.location).filter(Boolean);
  }

  // ── 機號聯動查詢 ─────────────────────────────────────────

  async getEquipmentOptions(machineType: string, tonnage?: string) {
    const source = this.resolveEquipmentSource(machineType);
    if (!source) return [];

    if (source === 'vehicle') {
      const where: any = { status: 'active' };
      if (tonnage) {
        const tonnageNum = parseFloat(tonnage.replace('噸', ''));
        if (!isNaN(tonnageNum)) where.tonnage = tonnageNum;
      }
      const [vehicles, subconDrivers] = await Promise.all([
        this.prisma.vehicle.findMany({
          where,
          select: { id: true, plate_number: true, machine_type: true, tonnage: true },
          orderBy: { plate_number: 'asc' },
        }),
        this.prisma.subcontractorFleetDriver.findMany({
          where: { status: 'active', plate_no: { not: null } },
          select: { id: true, plate_no: true, machine_type: true, subcontractor: { select: { name: true } } },
          orderBy: { plate_no: 'asc' },
        }),
      ]);

      const vehicleOptions = vehicles.map(v => ({
        id: v.id,
        value: v.plate_number,
        label: v.plate_number,
        tonnage: v.tonnage,
        type: v.machine_type,
        source: 'vehicle',
      }));

      const subconOptions = subconDrivers.map(d => ({
        id: d.id,
        value: d.plate_no!,
        label: `${d.plate_no} (${d.subcontractor.name})`,
        type: d.machine_type,
        source: 'subcon_fleet',
      }));

      return [...vehicleOptions, ...subconOptions];
    }

    if (source === 'machinery') {
      const where: any = { status: 'active' };
      if (tonnage) {
        const tonnageNum = parseFloat(tonnage.replace('噸', ''));
        if (!isNaN(tonnageNum)) where.tonnage = tonnageNum;
      }
      const machines = await this.prisma.machinery.findMany({
        where,
        select: { id: true, machine_code: true, machine_type: true, tonnage: true },
        orderBy: { machine_code: 'asc' },
      });
      return machines.map(m => ({
        id: m.id,
        value: m.machine_code,
        label: m.machine_code,
        tonnage: m.tonnage,
        type: m.machine_type,
        source: 'machinery',
      }));
    }

    return [];
  }

  // ── 自動價格匹配 ─────────────────────────────────────────
  private async matchAndSavePrice(workLog: any) {
    if (!workLog) return;

    if (!workLog.client_id) {
      await this.prisma.workLog.update({
        where: { id: workLog.id },
        data: {
          price_match_status: 'pending',
          price_match_note: '缺少客戶資訊，無法匹配',
          matched_rate_card_id: null,
          matched_rate: null,
          matched_unit: null,
          matched_ot_rate: null,
        },
      });
      return;
    }

    // 從 CompanyProfile 找對應的 Company ID
    let companyId: number | null = null;
    if (workLog.company_profile_id) {
      const cp = await this.prisma.companyProfile.findUnique({ where: { id: workLog.company_profile_id } });
      if (cp && (cp as any).company_id) {
        companyId = (cp as any).company_id;
      }
    }

    const tonnageNum = workLog.tonnage ? workLog.tonnage.replace('噸', '') : null;

    const card = await this.tryMatchRateCard(
      workLog.client_id,
      companyId,
      workLog.quotation_id,
      workLog.machine_type,
      tonnageNum,
      workLog.start_location,
      workLog.end_location,
    );

    if (!card) {
      await this.prisma.workLog.update({
        where: { id: workLog.id },
        data: {
          price_match_status: 'unmatched',
          price_match_note: '找不到對應的價目表，請人工處理',
          matched_rate_card_id: null,
          matched_rate: null,
          matched_unit: null,
          matched_ot_rate: null,
        },
      });
      return;
    }

    const { rate, unit } = this.resolveRate(card, workLog.day_night);

    await this.prisma.workLog.update({
      where: { id: workLog.id },
      data: {
        price_match_status: 'matched',
        price_match_note: `匹配到：${card.name || card.contract_no || `RateCard#${card.id}`}`,
        matched_rate_card_id: card.id,
        matched_rate: rate,
        matched_unit: unit,
        matched_ot_rate: card.ot_rate ?? null,
      },
    });
  }

  /**
   * 多層次模糊匹配，由精確到寬鬆
   */
  private async tryMatchRateCard(
    clientId: number,
    companyId: number | null,
    quotationId: number | null,
    vehicleType: string | null,
    tonnage: string | null,
    origin: string | null,
    destination: string | null,
  ): Promise<any | null> {
    const attempts = [
      { useCompany: true, useQuotation: true, useVehicle: true, useTonnage: true, useRoute: true },
      { useCompany: true, useQuotation: true, useVehicle: true, useTonnage: true, useRoute: false },
      { useCompany: true, useQuotation: true, useVehicle: true, useTonnage: false, useRoute: false },
      { useCompany: true, useQuotation: true, useVehicle: false, useTonnage: false, useRoute: false },
      { useCompany: false, useQuotation: false, useVehicle: true, useTonnage: true, useRoute: true },
      { useCompany: false, useQuotation: false, useVehicle: true, useTonnage: false, useRoute: false },
      { useCompany: false, useQuotation: false, useVehicle: false, useTonnage: false, useRoute: false },
    ];

    for (const attempt of attempts) {
      const where: any = { status: 'active', client_id: clientId };

      if (attempt.useCompany && companyId) where.company_id = companyId;
      if (attempt.useQuotation && quotationId) where.source_quotation_id = quotationId;
      if (attempt.useVehicle && vehicleType) where.machine_type = vehicleType;
      if (attempt.useTonnage && tonnage) where.tonnage = tonnage;
      if (attempt.useRoute) {
        if (origin) where.origin = { contains: origin, mode: 'insensitive' };
        if (destination) where.destination = { contains: destination, mode: 'insensitive' };
      }

      const card = await this.prisma.rateCard.findFirst({
        where,
        orderBy: { effective_date: 'desc' },
      });
      if (card) return card;
    }

    return null;
  }

  /**
   * 根據日/夜/中直取對應費率
   */
  private resolveRate(card: any, dayNight: string | null): { rate: number; unit: string } {
    if (dayNight === '夜') {
      return { rate: Number(card.night_rate) || 0, unit: card.night_unit || card.day_unit || '' };
    }
    if (dayNight === '中直') {
      return { rate: Number(card.mid_shift_rate) || 0, unit: card.mid_shift_unit || card.day_unit || '' };
    }
    return { rate: Number(card.day_rate) || 0, unit: card.day_unit || '' };
  }

  // ── 輔助方法 ─────────────────────────────────────────────

  private resolveEquipmentSource(machineType: string | null | undefined): 'vehicle' | 'machinery' | null {
    if (!machineType) return null;
    if (VEHICLE_TYPES.includes(machineType)) return 'vehicle';
    if (MACHINERY_TYPES.includes(machineType)) return 'machinery';
    return null;
  }
}
