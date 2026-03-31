import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { WorkLog } from './work-log.entity';
import { Vehicle } from '../vehicles/vehicle.entity';
import { Machinery } from '../machinery/machinery.entity';
import { RateCard } from '../rate-cards/rate-card.entity';
import { CompanyProfile } from '../company-profiles/company-profile.entity';

// 車輛類機種
const VEHICLE_TYPES = ['平斗', '勾斗', '夾斗', '拖頭', '車斗', '貨車', '輕型貨車', '私家車', '燈車'];
// 機械類機種
const MACHINERY_TYPES = ['挖掘機', '火轆'];

@Injectable()
export class WorkLogsService {
  constructor(
    @InjectRepository(WorkLog)
    private readonly repo: Repository<WorkLog>,
    @InjectRepository(Vehicle)
    private readonly vehicleRepo: Repository<Vehicle>,
    @InjectRepository(Machinery)
    private readonly machineryRepo: Repository<Machinery>,
    @InjectRepository(RateCard)
    private readonly rateCardRepo: Repository<RateCard>,
    @InjectRepository(CompanyProfile)
    private readonly companyProfileRepo: Repository<CompanyProfile>,
  ) {}

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
      employee_id,
      equipment_number,
      date_from,
      date_to,
      sortBy = 'scheduled_date',
      sortOrder = 'DESC',
    } = query;

    const allowedSort = [
      'id', 'scheduled_date', 'status', 'service_type',
      'machine_type', 'equipment_number', 'day_night', 'created_at',
    ];
    const safeSortBy = allowedSort.includes(sortBy) ? `wl.${sortBy}` : 'wl.scheduled_date';
    const safeSortOrder: 'ASC' | 'DESC' = sortOrder === 'ASC' ? 'ASC' : 'DESC';

    const qb = this.repo.createQueryBuilder('wl')
      .leftJoinAndSelect('wl.publisher', 'publisher')
      .leftJoinAndSelect('wl.company_profile', 'company_profile')
      .leftJoinAndSelect('wl.client', 'client')
      .leftJoinAndSelect('wl.quotation', 'quotation')
      .leftJoinAndSelect('wl.employee', 'employee');

    if (publisher_id) qb.andWhere('wl.publisher_id = :publisher_id', { publisher_id: Number(publisher_id) });
    if (status) qb.andWhere('wl.status = :status', { status });
    if (company_profile_id) qb.andWhere('wl.company_profile_id = :company_profile_id', { company_profile_id: Number(company_profile_id) });
    if (client_id) qb.andWhere('wl.client_id = :client_id', { client_id: Number(client_id) });
    if (quotation_id) qb.andWhere('wl.quotation_id = :quotation_id', { quotation_id: Number(quotation_id) });
    if (employee_id) qb.andWhere('wl.employee_id = :employee_id', { employee_id: Number(employee_id) });
    if (equipment_number) qb.andWhere('wl.equipment_number ILIKE :eq', { eq: `%${equipment_number}%` });
    if (date_from) qb.andWhere('wl.scheduled_date >= :date_from', { date_from });
    if (date_to) qb.andWhere('wl.scheduled_date <= :date_to', { date_to });

    qb.orderBy(safeSortBy, safeSortOrder)
      .skip((Number(page) - 1) * Number(limit))
      .take(Number(limit));

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) };
  }

  async findOne(id: number) {
    return this.repo.findOne({
      where: { id },
      relations: ['publisher', 'company_profile', 'client', 'quotation', 'employee'],
    });
  }

  async create(dto: any, userId: number) {
    const entity = this.repo.create({
      ...dto,
      publisher_id: dto.publisher_id ?? userId,
      equipment_source: this.resolveEquipmentSource(dto.machine_type),
    });
    const savedResult = await this.repo.save(entity);
    const saved = (Array.isArray(savedResult) ? savedResult[0] : savedResult) as WorkLog;
    // 自動匹配價格
    await this.matchAndSavePrice(saved);
    return this.findOne(saved.id);
  }

  async update(id: number, dto: any) {
    const { id: _id, created_at, updated_at, publisher, company_profile, client, quotation, employee, ...rest } = dto;
    if (rest.machine_type !== undefined) {
      rest.equipment_source = this.resolveEquipmentSource(rest.machine_type);
    }
    await this.repo.update(id, rest);
    const updated = await this.findOne(id);
    // 自動匹配價格（如果關鍵欄位有變動）
    const priceRelatedFields = ['client_id', 'company_profile_id', 'quotation_id', 'machine_type', 'tonnage', 'day_night', 'start_location', 'end_location'];
    const hasPriceChange = priceRelatedFields.some(f => f in rest);
    if (hasPriceChange && updated) {
      await this.matchAndSavePrice(updated);
    }
    return this.findOne(id);
  }

  async remove(id: number) {
    await this.repo.delete(id);
    return { success: true };
  }

  async bulkDelete(ids: number[]) {
    await this.repo.delete({ id: In(ids) });
    return { success: true, deleted: ids.length };
  }

  async bulkConfirm(ids: number[]) {
    await this.repo.update({ id: In(ids) }, { is_confirmed: true });
    return { success: true, confirmed: ids.length };
  }

  async duplicate(id: number, userId: number) {
    const original = await this.repo.findOne({ where: { id } });
    if (!original) throw new Error('WorkLog not found');
    const copy = this.repo.create({
      status: 'editing',
      service_type: original.service_type,
      scheduled_date: original.scheduled_date,
      company_profile_id: original.company_profile_id,
      client_id: original.client_id,
      quotation_id: original.quotation_id,
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
    } as any);
    const savedResult2 = await this.repo.save(copy);
    const saved = (Array.isArray(savedResult2) ? savedResult2[0] : savedResult2) as WorkLog;
    await this.matchAndSavePrice(saved);
    return this.findOne(saved.id);
  }

  // ── 地點自動完成 ─────────────────────────────────────────

  async getLocationSuggestions(type: 'start' | 'end', q: string) {
    const field = type === 'start' ? 'start_location' : 'end_location';
    const rows = await this.repo.createQueryBuilder('wl')
      .select(`DISTINCT wl.${field}`, 'location')
      .where(`wl.${field} ILIKE :q`, { q: `%${q}%` })
      .andWhere(`wl.${field} IS NOT NULL`)
      .andWhere(`wl.${field} != ''`)
      .orderBy('location', 'ASC')
      .limit(20)
      .getRawMany();
    return rows.map(r => r.location).filter(Boolean);
  }

  // ── 機號聯動查詢 ─────────────────────────────────────────

  async getEquipmentOptions(machineType: string, tonnage?: string) {
    const source = this.resolveEquipmentSource(machineType);
    if (!source) return [];

    if (source === 'vehicle') {
      const qb = this.vehicleRepo.createQueryBuilder('v')
        .select(['v.id', 'v.plate_number', 'v.vehicle_type', 'v.tonnage'])
        .where('v.status = :status', { status: 'active' });

      if (tonnage) {
        const tonnageNum = parseFloat(tonnage.replace('噸', ''));
        if (!isNaN(tonnageNum)) {
          qb.andWhere('v.tonnage = :tonnage', { tonnage: tonnageNum });
        }
      }
      const vehicles = await qb.orderBy('v.plate_number', 'ASC').getMany();
      return vehicles.map(v => ({
        id: v.id,
        value: v.plate_number,
        label: v.plate_number,
        tonnage: v.tonnage,
        type: v.vehicle_type,
        source: 'vehicle',
      }));
    }

    if (source === 'machinery') {
      const qb = this.machineryRepo.createQueryBuilder('m')
        .select(['m.id', 'm.machine_code', 'm.machine_type', 'm.tonnage'])
        .where('m.status = :status', { status: 'active' });

      if (tonnage) {
        const tonnageNum = parseFloat(tonnage.replace('噸', ''));
        if (!isNaN(tonnageNum)) {
          qb.andWhere('m.tonnage = :tonnage', { tonnage: tonnageNum });
        }
      }
      const machines = await qb.orderBy('m.machine_code', 'ASC').getMany();
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
  /**
   * 匹配策略（由精確到模糊，取第一個命中）：
   * 1. client_id + company_id(from CompanyProfile) + source_quotation_id + vehicle_type + tonnage + origin + destination
   * 2. 同上，但不限 origin/destination
   * 3. 同上，但不限 vehicle_type/tonnage
   * 4. 只匹配 client_id + company_id
   *
   * 日/夜/中直 → 取對應的 day_rate / night_rate / mid_shift_rate
   */
  private async matchAndSavePrice(workLog: WorkLog | null) {
    if (!workLog) return;

    // 需要至少有客戶才能匹配
    if (!workLog.client_id) {
      await this.repo.update(workLog.id, {
        price_match_status: 'pending',
        price_match_note: '缺少客戶資訊，無法匹配',
        matched_rate_card_id: null,
        matched_rate: null,
        matched_unit: null,
        matched_ot_rate: null,
      } as any);
      return;
    }

    // 從 CompanyProfile 找對應的 Company ID（rate_cards 用 company_id 而非 company_profile_id）
    let companyId: number | null = null;
    if (workLog.company_profile_id) {
      const cp = await this.companyProfileRepo.findOne({ where: { id: workLog.company_profile_id } });
      if (cp && (cp as any).company_id) {
        companyId = (cp as any).company_id;
      }
    }

    // 噸數數字（去除「噸」字）
    const tonnageNum = workLog.tonnage ? workLog.tonnage.replace('噸', '') : null;

    // 嘗試各層次匹配
    const card = await this.tryMatchRateCard(
      workLog.client_id,
      companyId,
      workLog.quotation_id,    // source_quotation_id
      workLog.machine_type,    // vehicle_type
      tonnageNum,              // vehicle_tonnage
      workLog.start_location,  // origin
      workLog.end_location,    // destination
    );

    if (!card) {
      await this.repo.update(workLog.id, {
        price_match_status: 'unmatched',
        price_match_note: '找不到對應的價目表，請人工處理',
        matched_rate_card_id: null,
        matched_rate: null,
        matched_unit: null,
        matched_ot_rate: null,
      } as any);
      return;
    }

    // 根據日/夜/中直取對應費率
    const { rate, unit } = this.resolveRate(card, workLog.day_night);

    await this.repo.update(workLog.id, {
      price_match_status: 'matched',
      price_match_note: `匹配到：${card.name || card.contract_no || `RateCard#${card.id}`}`,
      matched_rate_card_id: card.id,
      matched_rate: rate,
      matched_unit: unit,
      matched_ot_rate: card.ot_rate ?? null,
    } as any);
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
  ): Promise<RateCard | null> {
    // 匹配層次定義
    const attempts = [
      // 層次 1：最精確 — 客戶 + 公司 + 合約 + 機種 + 噸數 + 起終點
      { useCompany: true, useQuotation: true, useVehicle: true, useTonnage: true, useRoute: true },
      // 層次 2：客戶 + 公司 + 合約 + 機種 + 噸數（不限路線）
      { useCompany: true, useQuotation: true, useVehicle: true, useTonnage: true, useRoute: false },
      // 層次 3：客戶 + 公司 + 合約 + 機種（不限噸數/路線）
      { useCompany: true, useQuotation: true, useVehicle: true, useTonnage: false, useRoute: false },
      // 層次 4：客戶 + 公司 + 合約（不限機種）
      { useCompany: true, useQuotation: true, useVehicle: false, useTonnage: false, useRoute: false },
      // 層次 5：客戶 + 機種 + 噸數 + 路線（不限公司/合約）
      { useCompany: false, useQuotation: false, useVehicle: true, useTonnage: true, useRoute: true },
      // 層次 6：客戶 + 機種（最寬鬆）
      { useCompany: false, useQuotation: false, useVehicle: true, useTonnage: false, useRoute: false },
      // 層次 7：只匹配客戶
      { useCompany: false, useQuotation: false, useVehicle: false, useTonnage: false, useRoute: false },
    ];

    for (const attempt of attempts) {
      const qb = this.rateCardRepo.createQueryBuilder('rc')
        .where('rc.status = :status', { status: 'active' })
        .andWhere('rc.client_id = :clientId', { clientId });

      if (attempt.useCompany && companyId) {
        qb.andWhere('rc.company_id = :companyId', { companyId });
      }
      if (attempt.useQuotation && quotationId) {
        qb.andWhere('rc.source_quotation_id = :quotationId', { quotationId });
      }
      if (attempt.useVehicle && vehicleType) {
        qb.andWhere('rc.vehicle_type = :vehicleType', { vehicleType });
      }
      if (attempt.useTonnage && tonnage) {
        qb.andWhere('rc.vehicle_tonnage = :tonnage', { tonnage });
      }
      if (attempt.useRoute) {
        if (origin) qb.andWhere('rc.origin ILIKE :origin', { origin: `%${origin}%` });
        if (destination) qb.andWhere('rc.destination ILIKE :destination', { destination: `%${destination}%` });
      }

      // 優先取最新生效的
      qb.orderBy('rc.effective_date', 'DESC').limit(1);

      const card = await qb.getOne();
      if (card) return card;
    }

    return null;
  }

  /**
   * 根據日/夜/中直取對應費率
   */
  private resolveRate(card: RateCard, dayNight: string | null): { rate: number; unit: string } {
    if (dayNight === '夜') {
      return { rate: Number(card.night_rate) || 0, unit: card.night_unit || card.day_unit || '' };
    }
    if (dayNight === '中直') {
      return { rate: Number(card.mid_shift_rate) || 0, unit: card.mid_shift_unit || card.day_unit || '' };
    }
    // 日班或未指定
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
