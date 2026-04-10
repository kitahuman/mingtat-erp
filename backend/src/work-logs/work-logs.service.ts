import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../common/pricing.service';

// 車輛類機種
const VEHICLE_TYPES = ['平斗', '勾斗', '夾斗', '拖頭', '車斗', '貨車', '輕型貨車', '私家車', '燈車'];
// 機械類機種
const MACHINERY_TYPES = ['挖掘機', '火轆'];

@Injectable()
export class WorkLogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricingService: PricingService,
  ) {}

  // ── 工作記錄 CRUD ─────────────────────────────────────────

  async findAll(query: any) {
    const {
      page = 1,
      limit = 25,
      publisher_id,
      status,
      company_profile_id,
      company_id,
      client_id,
      quotation_id,
      contract_id,
      employee_id,
      equipment_number,
      date_from,
      date_to,
      sortBy = 'created_at',
      sortOrder = 'DESC',
    } = query;

    const where: any = {};
    if (publisher_id) where.publisher_id = Number(publisher_id);
    if (status) where.status = status;
    if (company_profile_id) where.company_profile_id = Number(company_profile_id);
    if (company_id) where.company_id = Number(company_id);
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
          company: true,
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
        company: true,
        client: true,
        quotation: true,
        contract: true,
        employee: true,
        project: true,
      },
    });
  }

  async create(dto: any, userId: number) {
    const { publisher, company_profile, company, client, quotation, contract, employee, project, payroll_work_logs, matched_rate_card, rate_card, ...data } = dto;
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
      publisher, company_profile, company, client, quotation, contract, employee,
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

    // 如果編輯了地點欄位，自動消除 WhatsApp 新地點黃色標記
    if ('start_location' in rest || 'end_location' in rest) {
      rest.is_location_new = false;
    }

    await this.prisma.workLog.update({ where: { id }, data: rest });
    // 自動匹配價格（如果關鍵欄位有變動）
    const priceRelatedFields = ['client_id', 'company_profile_id', 'company_id', 'quotation_id', 'contract_id', 'client_contract_no', 'machine_type', 'tonnage', 'day_night', 'start_location', 'end_location'];
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
    // 先解除 PayrollWorkLog 的關聯
    await this.prisma.payrollWorkLog.updateMany({
      where: { work_log_id: id },
      data: { work_log_id: null },
    });
    await this.prisma.workLog.delete({ where: { id } });
    return { success: true };
  }

  async bulkDelete(ids: number[]) {
    // Guard: ids must be a non-empty array
    if (!Array.isArray(ids) || ids.length === 0) {
      return { success: true, deleted: 0 };
    }

    // Coerce every element to a proper integer (HTTP JSON may deliver strings
    // or floating-point numbers depending on the client).
    const safeIds = ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0);
    if (safeIds.length === 0) {
      return { success: true, deleted: 0 };
    }

    // Step 1: Detach PayrollWorkLog rows that reference these work-logs so the
    //         FK constraint (ON DELETE SET NULL) is handled explicitly before
    //         the deleteMany, avoiding any race-condition or deferred-FK issue.
    await this.prisma.payrollWorkLog.updateMany({
      where: { work_log_id: { in: safeIds } },
      data: { work_log_id: null },
    });

    // Step 2: Delete the work-log rows.
    const result = await this.prisma.workLog.deleteMany({
      where: { id: { in: safeIds } },
    });

    return { success: true, deleted: result.count };
  }

  async bulkUpdate(ids: number[], field: string, value: any) {
    // Whitelist of fields that can be batch-updated
    const ALLOWED_FIELDS = [
      'status', 'scheduled_date', 'service_type',
      'company_profile_id', 'company_id', 'client_id',
      'quotation_id', 'contract_id', 'client_contract_no',
      'employee_id', 'machine_type', 'equipment_number', 'tonnage',
      'day_night', 'start_location', 'start_time',
      'end_location', 'end_time',
      'quantity', 'unit', 'ot_quantity', 'ot_unit',
      'is_mid_shift', 'goods_quantity',
      'receipt_no', 'work_order_no',
      'is_confirmed', 'is_paid', 'remarks',
    ];
    if (!ALLOWED_FIELDS.includes(field)) {
      throw new Error(`Field "${field}" is not allowed for batch update`);
    }

    let processedValue = value;
    // Type coercions
    if (field === 'scheduled_date' && processedValue) {
      processedValue = new Date(processedValue);
    }
    if (['company_profile_id', 'company_id', 'client_id', 'quotation_id', 'contract_id', 'employee_id'].includes(field)) {
      processedValue = processedValue !== null && processedValue !== '' ? Number(processedValue) : null;
    }
    if (['quantity', 'ot_quantity', 'goods_quantity'].includes(field)) {
      processedValue = processedValue !== null && processedValue !== '' ? Number(processedValue) : null;
    }
    if (['is_mid_shift', 'is_confirmed', 'is_paid'].includes(field)) {
      processedValue = Boolean(processedValue);
    }
    if (field === 'machine_type') {
      // Also update equipment_source
      const equipmentSource = this.resolveEquipmentSource(processedValue);
      await this.prisma.workLog.updateMany({
        where: { id: { in: ids } },
        data: { machine_type: processedValue, equipment_source: equipmentSource },
      });
      // Re-match prices for affected records
      const priceRelatedFields = ['machine_type'];
      if (priceRelatedFields.includes(field)) {
        const updatedLogs = await this.prisma.workLog.findMany({ where: { id: { in: ids } }, include: { company: true, client: true } });
        await Promise.all(updatedLogs.map(log => this.matchAndSavePrice(log)));
      }
      return { success: true, updated: ids.length };
    }

    await this.prisma.workLog.updateMany({
      where: { id: { in: ids } },
      data: { [field]: processedValue },
    });

    // Re-match prices if price-related field changed
    const priceRelatedFields = ['client_id', 'company_profile_id', 'company_id', 'quotation_id', 'contract_id', 'client_contract_no', 'tonnage', 'day_night', 'start_location', 'end_location'];
    if (priceRelatedFields.includes(field)) {
      const updatedLogs = await this.prisma.workLog.findMany({ where: { id: { in: ids } }, include: { company: true, client: true } });
      await Promise.all(updatedLogs.map(log => this.matchAndSavePrice(log)));
    }

    return { success: true, updated: ids.length };
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
        company_id: original.company_id,
        client_id: original.client_id,
        quotation_id: original.quotation_id,
        contract_id: original.contract_id,
        client_contract_no: original.client_contract_no,
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

    // 根據業務邏輯：工作記錄配對費率查 FleetRateCard（租賃價目表），用於計算員工薪酬/機械成本
    // RateCard（客戶價目表）用於開發票，SubconRateCard（供應商價目表）用於付款給供應商
    const { card, unmatchedReason } = await this.pricingService.matchFleetRateCardFromDb(
      workLog.client_id,
      workLog.company_id || workLog.company_profile_id,
      workLog.client_contract_no || null,
      workLog.service_type,
      workLog.day_night,
      workLog.tonnage,
      workLog.machine_type,
      workLog.start_location,
      workLog.end_location,
    );

    if (!card) {
      await this.prisma.workLog.update({
        where: { id: workLog.id },
        data: {
          price_match_status: 'unmatched',
          price_match_note: unmatchedReason || '找不到對應的租賃價目表，請人工處理',
          matched_rate_card_id: null,
          matched_rate: null,
          matched_unit: null,
          matched_ot_rate: null,
        },
      });
      return;
    }

    const { rate, unit } = this.pricingService.resolveRate(card, workLog.day_night);

    await this.prisma.workLog.update({
      where: { id: workLog.id },
      data: {
        price_match_status: 'matched',
        price_match_note: `匹配到：${card.name || card.client_contract_no || `FleetRC#${card.id}`}`,
        matched_rate_card_id: card.id,
        matched_rate: rate,
        matched_unit: unit,
        matched_ot_rate: card.ot_rate ?? null,
      },
    });
  }

  // tryMatchRateCard 和 resolveRate 已移至 PricingService

  // ── 批量儲存 (Airtable 風格) ───────────────────────────

  async bulkSave(changes: Array<{ id: number; data: any }>) {
    const results: any[] = [];
    for (const { id, data } of changes) {
      try {
        const updated = await this.update(id, data);
        results.push({ id, success: true, data: updated });
      } catch (e: any) {
        results.push({ id, success: false, error: e.message });
      }
    }
    return { results, saved: results.filter(r => r.success).length, failed: results.filter(r => !r.success).length };
  }

  // ── 編輯鎖定 (簡易在記憶體實作) ─────────────────────

  private static editLocks = new Map<string, { userId: number; userName: string; timestamp: number }>();

  acquireEditLock(lockKey: string, userId: number, userName: string) {
    const existing = WorkLogsService.editLocks.get(lockKey);
    const now = Date.now();
    // Lock expires after 5 minutes of no heartbeat
    if (existing && existing.userId !== userId && (now - existing.timestamp) < 5 * 60 * 1000) {
      return { acquired: false, lockedBy: existing.userName, lockedAt: existing.timestamp };
    }
    WorkLogsService.editLocks.set(lockKey, { userId, userName, timestamp: now });
    return { acquired: true };
  }

  heartbeatEditLock(lockKey: string, userId: number) {
    const existing = WorkLogsService.editLocks.get(lockKey);
    if (existing && existing.userId === userId) {
      existing.timestamp = Date.now();
      return { ok: true };
    }
    return { ok: false };
  }

  releaseEditLock(lockKey: string, userId: number) {
    const existing = WorkLogsService.editLocks.get(lockKey);
    if (existing && existing.userId === userId) {
      WorkLogsService.editLocks.delete(lockKey);
    }
    return { ok: true };
  }

  getEditLockStatus(lockKey: string, userId: number) {
    const existing = WorkLogsService.editLocks.get(lockKey);
    const now = Date.now();
    if (!existing || (now - existing.timestamp) >= 5 * 60 * 1000) {
      return { locked: false };
    }
    return {
      locked: true,
      lockedBy: existing.userName,
      isMe: existing.userId === userId,
    };
  }

  // ── 確認地點（消除 WhatsApp 打卡黃色 Highlight）───────────

  async confirmLocation(id: number) {
    await this.prisma.workLog.update({
      where: { id },
      data: { is_location_new: false },
    });
    return { success: true };
  }

  // ── 輔助方法 ─────────────────────────────────────────────

  private resolveEquipmentSource(machineType: string | null | undefined): 'vehicle' | 'machinery' | null {
    if (!machineType) return null;
    if (VEHICLE_TYPES.includes(machineType)) return 'vehicle';
    if (MACHINERY_TYPES.includes(machineType)) return 'machinery';
    return null;
  }
}
