import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { WorkLog } from './work-log.entity';
import { Vehicle } from '../vehicles/vehicle.entity';
import { Machinery } from '../machinery/machinery.entity';

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
    return this.repo.save(entity);
  }

  async update(id: number, dto: any) {
    const { id: _id, created_at, updated_at, publisher, company_profile, client, quotation, employee, ...rest } = dto;
    if (rest.machine_type !== undefined) {
      rest.equipment_source = this.resolveEquipmentSource(rest.machine_type);
    }
    await this.repo.update(id, rest);
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
    return this.repo.save(copy);
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

  // ── 輔助方法 ─────────────────────────────────────────────

  private resolveEquipmentSource(machineType: string | null | undefined): 'vehicle' | 'machinery' | null {
    if (!machineType) return null;
    if (VEHICLE_TYPES.includes(machineType)) return 'vehicle';
    if (MACHINERY_TYPES.includes(machineType)) return 'machinery';
    return null;
  }
}
