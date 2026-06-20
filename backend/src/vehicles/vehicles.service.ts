import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PrismaService } from '../prisma/prisma.service';
import { RemovePlateDto } from './dto/create-vehicle.dto';

@Injectable()
export class VehiclesService {
  constructor(private prisma: PrismaService, private readonly auditLogsService: AuditLogsService) {}

  async simple() {
    const vehicles = await this.prisma.vehicle.findMany({
      where: { status: { not: 'scrapped' }, deleted_at: null },
      select: { id: true, plate_number: true, machine_type: true, tonnage: true },
      orderBy: { plate_number: 'asc' },
    });
    return vehicles.map(v => ({
      id: v.id,
      value: v.plate_number,
      label: v.plate_number,
      plate_number: v.plate_number,
      type: v.machine_type,
      tonnage: v.tonnage ? String(v.tonnage) : null,
      category: 'vehicle',
    }));
  }

  async findAll(query: {
    page?: number; limit?: number; search?: string;
    machine_type?: string; owner_company_id?: number; status?: string;
    sortBy?: string; sortOrder?: string;
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const where: any = { deleted_at: null };

    if (query.machine_type) where.machine_type = query.machine_type;
    if (query.owner_company_id) where.owner_company_id = Number(query.owner_company_id);
    if (query.status === 'not_scrapped') where.status = { not: 'scrapped' };
    else if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { plate_number: { contains: query.search, mode: 'insensitive' } },
        { brand: { contains: query.search, mode: 'insensitive' } },
        { model: { contains: query.search, mode: 'insensitive' } },
        { vehicle_chassis_no: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const allowedSortFields = ['plate_number', 'machine_type', 'tonnage', 'brand', 'model', 'insurance_expiry', 'inspection_date', 'license_expiry', 'status', 'id', 'created_at', 'scrapped_at'];
    const sortBy = allowedSortFields.includes(query.sortBy || '') ? query.sortBy! : 'id';
    const sortOrder = query.sortOrder?.toUpperCase() === 'DESC' ? 'desc' : 'asc';

    const [data, total] = await Promise.all([
      this.prisma.vehicle.findMany({
        where,
        include: { owner_company: true, current_plate: true },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.vehicle.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id },
      include: {
        owner_company: true,
        current_plate: true,
        plate_assignments: {
          include: { plate: true },
          orderBy: [{ assigned_date: 'desc' }, { created_at: 'desc' }],
        },
        transfers: {
          include: { from_company: true, to_company: true },
          orderBy: [{ transfer_date: 'desc' }, { created_at: 'desc' }],
        },
        history_events: { orderBy: [{ event_date: 'desc' }, { created_at: 'desc' }] },
      },
    });
    if (!vehicle) throw new NotFoundException('車輛不存在');
    return vehicle;
  }

  async create(dto: any, userId?: number, ipAddress?: string) {
    const {
      owner_company, plate_history, transfers, current_plate, plate_assignments, history_events,
      current_plate_id, scrapped_at, scrapped_by, id: _id, created_at, updated_at,
      plate_mode, existing_plate_id, assigned_date, ...rawData
    } = dto;

    const data = this.normalizeVehicleData(rawData, true);
    if (!data.owner_company_id) throw new BadRequestException('必須選擇持有公司');

    const mode = plate_mode || (existing_plate_id ? 'existing' : 'new');
    const saved = await this.prisma.$transaction(async (tx) => {
      let plate: any = null;
      if (mode === 'existing') {
        if (!existing_plate_id) throw new BadRequestException('必須選擇閒置車牌');
        plate = await tx.vehiclePlate.findUnique({ where: { id: Number(existing_plate_id) } });
        if (!plate) throw new NotFoundException('車牌不存在');
        if (plate.status !== 'idle' || plate.current_vehicle_id) throw new BadRequestException('只能套用閒置車牌');
        data.plate_number = plate.plate_number;
      } else {
        if (!data.plate_number) throw new BadRequestException('必須輸入新車牌號碼');
        const exists = await tx.vehiclePlate.findUnique({ where: { plate_number: data.plate_number } });
        if (exists) throw new BadRequestException('此車牌已存在，請改用「套用現有閒置車牌」');
      }

      const vehicle = await tx.vehicle.create({ data });

      if (mode === 'existing') {
        await tx.vehiclePlate.update({
          where: { id: plate.id },
          data: { status: 'in_use', current_vehicle_id: vehicle.id, owner_company_id: vehicle.owner_company_id },
        });
      } else {
        plate = await tx.vehiclePlate.create({
          data: {
            plate_number: vehicle.plate_number,
            owner_company_id: vehicle.owner_company_id,
            status: 'in_use',
            current_vehicle_id: vehicle.id,
          },
        });
      }

      await tx.vehicle.update({ where: { id: vehicle.id }, data: { current_plate_id: plate.id } });
      await tx.vehiclePlateAssignment.create({
        data: {
          plate_id: plate.id,
          vehicle_id: vehicle.id,
          assigned_date: assigned_date ? new Date(assigned_date) : new Date(),
          notes: mode === 'existing' ? '新增車輛時套用閒置車牌' : '新增車輛時建立新車牌',
        },
      });
      return tx.vehicle.findUnique({ where: { id: vehicle.id } });
    });

    await this.log(userId, 'create', 'vehicles', saved!.id, undefined, saved, ipAddress);
    return this.findOne(saved!.id);
  }

  async update(id: number, dto: any, userId?: number, ipAddress?: string) {
    const existing = await this.prisma.vehicle.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('車輛不存在');
    const { plate_history, transfers, owner_company, current_plate, plate_assignments, history_events, created_at, updated_at, id: _id, current_plate_id, scrapped_at, scrapped_by, ...rawUpdateData } = dto;
    const updateData = this.normalizeVehicleData(rawUpdateData, false);

    const updated = await this.prisma.vehicle.update({ where: { id }, data: updateData });
    await this.log(userId, 'update', 'vehicles', id, existing, updated, ipAddress);
    return this.findOne(id);
  }

  async changePlate(id: number, dto: { new_plate: string; change_date: string; notes?: string; reason?: string }) {
    const changeDate = new Date(dto.change_date);
    const newPlateNumber = dto.new_plate?.trim();
    if (!newPlateNumber) throw new BadRequestException('必須輸入新車牌號碼');

    await this.prisma.$transaction(async (tx) => {
      const vehicle = await tx.vehicle.findUnique({ where: { id }, include: { current_plate: true } });
      if (!vehicle) throw new NotFoundException('車輛不存在');
      if (vehicle.status === 'scrapped') throw new BadRequestException('已劏車的車輛不能換牌');
      if (vehicle.current_plate?.plate_number === newPlateNumber || vehicle.plate_number === newPlateNumber) return;

      let targetPlate = await tx.vehiclePlate.findUnique({ where: { plate_number: newPlateNumber } });
      if (targetPlate && targetPlate.current_vehicle_id && targetPlate.current_vehicle_id !== id) {
        throw new BadRequestException('此車牌已套用在其他車輛');
      }
      if (!targetPlate) {
        targetPlate = await tx.vehiclePlate.create({
          data: {
            plate_number: newPlateNumber,
            owner_company_id: vehicle.owner_company_id,
            status: 'idle',
          },
        });
      }

      if (vehicle.current_plate_id && vehicle.current_plate_id !== targetPlate.id) {
        await tx.vehiclePlateAssignment.updateMany({
          where: { plate_id: vehicle.current_plate_id, vehicle_id: id, removed_date: null },
          data: { removed_date: changeDate, notes: dto.notes || dto.reason || '換牌時自動拆牌' },
        });
        await tx.vehiclePlate.update({
          where: { id: vehicle.current_plate_id },
          data: { status: 'idle', current_vehicle_id: null },
        });
      }

      await tx.vehiclePlateAssignment.create({
        data: {
          plate_id: targetPlate.id,
          vehicle_id: id,
          assigned_date: changeDate,
          notes: dto.notes || dto.reason || '車輛換牌',
        },
      });
      await tx.vehiclePlate.update({
        where: { id: targetPlate.id },
        data: { status: 'in_use', current_vehicle_id: id, owner_company_id: vehicle.owner_company_id },
      });
      await tx.vehicle.update({
        where: { id },
        data: { plate_number: newPlateNumber, current_plate_id: targetPlate.id },
      });
      await tx.vehicleHistoryEvent.create({
        data: {
          vehicle_id: id,
          event_date: changeDate,
          event_type: 'plate_changed',
          description: `車牌從 ${vehicle.plate_number || '(無)'} 更換為 ${newPlateNumber}`,
        },
      });
    });
    return this.findOne(id);
  }

  async removePlate(id: number, dto: RemovePlateDto) {
    const removeDate = new Date(dto.remove_date);

    await this.prisma.$transaction(async (tx) => {
      const vehicle = await tx.vehicle.findUnique({ where: { id }, include: { current_plate: true } });
      if (!vehicle) throw new NotFoundException('車輛不存在');
      if (!vehicle.current_plate_id || !vehicle.current_plate) throw new BadRequestException('此車輛目前沒有車牌');

      const plateNumber = vehicle.current_plate.plate_number || vehicle.plate_number;
      await tx.vehiclePlateAssignment.updateMany({
        where: { plate_id: vehicle.current_plate_id, vehicle_id: id, removed_date: null },
        data: { removed_date: removeDate, notes: dto.notes },
      });
      await tx.vehiclePlate.update({
        where: { id: vehicle.current_plate_id },
        data: { status: 'idle', current_vehicle_id: null },
      });
      await tx.vehicle.update({
        where: { id },
        data: { plate_number: '', current_plate_id: null },
      });
      await tx.vehicleHistoryEvent.create({
        data: {
          vehicle_id: id,
          event_date: removeDate,
          event_type: 'plate_removed',
          description: `移除車牌 ${plateNumber}`,
        },
      });
    });

    return this.findOne(id);
  }

  async transferVehicle(id: number, dto: { from_company_id: number; to_company_id: number; transfer_date: string; notes?: string; reason?: string }) {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id } });
    if (!vehicle) throw new NotFoundException('車輛不存在');
    await this.prisma.vehicleTransfer.create({
      data: {
        vehicle_id: id,
        from_company_id: Number(dto.from_company_id),
        to_company_id: Number(dto.to_company_id),
        transfer_date: new Date(dto.transfer_date),
        notes: dto.notes || dto.reason,
      },
    });
    await this.prisma.vehicle.update({ where: { id }, data: { owner_company_id: Number(dto.to_company_id) } });
    return this.findOne(id);
  }

  async addTransferHistory(id: number, dto: { from_company_id: number; to_company_id: number; transfer_date: string; notes?: string; reason?: string }) {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id } });
    if (!vehicle) throw new NotFoundException('車輛不存在');
    await this.prisma.vehicleTransfer.create({
      data: {
        vehicle_id: id,
        from_company_id: Number(dto.from_company_id),
        to_company_id: Number(dto.to_company_id),
        transfer_date: new Date(dto.transfer_date),
        notes: dto.notes || dto.reason,
      },
    });
    return this.findOne(id);
  }

  async addHistoryEvent(id: number, dto: { event_date: string; event_type: string; description: string }) {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id } });
    if (!vehicle) throw new NotFoundException('車輛不存在');
    if (!dto.event_date || !dto.event_type || !dto.description) throw new BadRequestException('日期、類型及描述為必填');
    await this.prisma.vehicleHistoryEvent.create({
      data: {
        vehicle_id: id,
        event_date: new Date(dto.event_date),
        event_type: dto.event_type,
        description: dto.description,
      },
    });
    return this.findOne(id);
  }

  async scrap(id: number, userId?: number, ipAddress?: string) {
    const existing = await this.prisma.vehicle.findUnique({ where: { id }, include: { current_plate: true } });
    if (!existing) throw new NotFoundException('車輛不存在');
    if (existing.status === 'scrapped') throw new BadRequestException('此車輛已劏車');

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      if (existing.current_plate_id) {
        await tx.vehiclePlateAssignment.updateMany({
          where: { plate_id: existing.current_plate_id, vehicle_id: id, removed_date: null },
          data: { removed_date: now, notes: '車輛劏車時自動拆牌' },
        });
        await tx.vehiclePlate.update({
          where: { id: existing.current_plate_id },
          data: { status: 'idle', current_vehicle_id: null },
        });
      }
      return tx.vehicle.update({
        where: { id },
        data: {
          status: 'scrapped',
          scrapped_at: now,
          scrapped_by: userId || null,
          current_plate_id: null,
          plate_number: '',
          vehicle_original_plate: existing.vehicle_original_plate || existing.current_plate?.plate_number || existing.plate_number,
        },
      });
    });

    await this.log(userId, 'scrap', 'vehicles', id, existing, updated, ipAddress);
    return this.findOne(id);
  }

  async restore(id: number, userId?: number, ipAddress?: string) {
    const existing = await this.prisma.vehicle.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('車輛不存在');
    const updated = await this.prisma.vehicle.update({ where: { id }, data: { status: 'active', scrapped_at: null, scrapped_by: null } });
    await this.log(userId, 'restore', 'vehicles', id, existing, updated, ipAddress);
    return this.findOne(id);
  }

  async remove(id: number, userId?: number, ipAddress?: string) {
    const existing = await this.prisma.vehicle.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('車輛不存在');
    await this.log(userId, 'delete', 'vehicles', id, existing, undefined, ipAddress);
    await this.prisma.vehicle.update({ where: { id }, data: { deleted_at: new Date(), deleted_by: userId ?? null } });
    return { message: '刪除成功' };
  }

  private normalizeVehicleData(input: any, isCreate: boolean) {
    const data: any = { ...input };
    const dateFields = ['insurance_expiry', 'inspection_date', 'license_expiry', 'vehicle_first_reg_date', 'vehicle_mud_tail_expiry'];
    for (const field of dateFields) {
      if (field in data) data[field] = data[field] ? new Date(data[field]) : null;
    }
    if ('vehicle_has_gps' in data) {
      data.vehicle_has_gps = data.vehicle_has_gps === true || data.vehicle_has_gps === 'true' ? true : data.vehicle_has_gps === false || data.vehicle_has_gps === 'false' ? false : null;
    }
    if ('tonnage' in data) data.tonnage = data.tonnage != null && data.tonnage !== '' ? Number(data.tonnage) : null;
    if ('owner_company_id' in data) data.owner_company_id = data.owner_company_id ? Number(data.owner_company_id) : data.owner_company_id;
    const stringFields = ['plate_number', 'machine_type', 'brand', 'model', 'status', 'notes', 'vehicle_chassis_no', 'vehicle_electronic_comm', 'vehicle_autotoll_collected', 'vehicle_autotoll', 'vehicle_inspection_notes', 'vehicle_insurance_agent', 'vehicle_insurance_company', 'vehicle_original_plate', 'vehicle_owner_name'];
    for (const field of stringFields) {
      if (field in data) data[field] = data[field] === '' ? (field === 'plate_number' && isCreate ? '' : null) : data[field];
    }
    return data;
  }

  private async log(userId: number | undefined, action: string, targetTable: string, targetId: number, changesBefore?: any, changesAfter?: any, ipAddress?: string) {
    if (!userId) return;
    try {
      const auditAction = action === 'create' || action === 'delete' ? action : 'update';
      await this.auditLogsService.log({ userId, action: auditAction, targetTable, targetId, changesBefore: { ...changesBefore, _operation: action }, changesAfter, ipAddress });
    } catch (e) { console.error('Audit log error:', e); }
  }
}
