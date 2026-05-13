import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PrismaService } from '../prisma/prisma.service';
import { AssignVehiclePlateDto, CreateVehiclePlateDto, ManualPlateAssignmentHistoryDto, ManualPlateTransferHistoryDto, TransferVehiclePlateDto, UpdateVehiclePlateDto } from './dto/vehicle-plate.dto';

interface VehiclePlateListQuery {
  page?: number | string;
  limit?: number | string;
  status?: string;
  search?: string;
  owner_company_id?: number | string;
  sortBy?: string;
  sortOrder?: string;
  [key: string]: string | number | undefined;
}

type ColumnFilters = Record<string, string[]>;

@Injectable()
export class VehiclePlatesService {
  constructor(private prisma: PrismaService, private readonly auditLogsService: AuditLogsService) {}

  private parseColumnFilters(query: VehiclePlateListQuery): ColumnFilters {
    const filters: ColumnFilters = {};
    for (const key of Object.keys(query)) {
      if (!key.startsWith('filter_') || !query[key]) continue;
      const field = key.replace('filter_', '');
      const values = String(query[key])
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      if (values.length > 0) filters[field] = values;
    }
    return filters;
  }

  private formatDisplayDate(date: Date | string | null | undefined): string {
    if (!date) return '-';
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return '-';
    const day = String(d.getUTCDate()).padStart(2, '0');
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const year = d.getUTCFullYear();
    return `${day}/${month}/${year}`;
  }

  private getVehicleLabel(vehicle: any): string {
    if (!vehicle) return '-';
    return `${vehicle.plate_number || ''} ${vehicle.brand || ''} ${vehicle.model || ''}`.trim() || '-';
  }

  private renderCompany(company: any): string {
    if (!company) return '-';
    return company.internal_prefix ? `${company.internal_prefix} - ${company.name}` : company.name || '-';
  }

  private getFilterDisplayValue(row: any, field: string): string {
    if (field === 'owner_company') return row.owner_company_label || '-';
    if (field === 'vehicle_label') return row.vehicle_label || '-';
    if (field === 'owned_date' || field === 'activity_date' || field === 'plate_expiry_date' || field === 'plate_owned_date') return this.formatDisplayDate(row[field]);
    if (field === 'status') return row.status === 'in_use' ? '使用中' : row.status === 'idle' ? '閒置' : row.status || '-';
    const value = row[field];
    return value == null || value === '' ? '-' : String(value);
  }

  private async getPlateRows(query: VehiclePlateListQuery, excludeFilterColumn?: string) {
    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.owner_company_id) where.owner_company_id = Number(query.owner_company_id);
    if (query.search) where.plate_number = { contains: query.search, mode: 'insensitive' };

    const records = await this.prisma.vehiclePlate.findMany({
      where,
      include: {
        owner_company: true,
        current_vehicle: { include: { owner_company: true } },
        transfers: {
          include: { from_company: true, to_company: true },
          orderBy: [{ transfer_date: 'desc' }, { created_at: 'desc' }],
          take: 1,
        },
        assignments: {
          include: { vehicle: { include: { owner_company: true } } },
          orderBy: [{ removed_date: 'desc' }, { assigned_date: 'desc' }, { created_at: 'desc' }],
          take: 1,
        },
      },
      orderBy: { plate_number: 'asc' },
    });

    let rows = records.map((plate) => {
      const latest_assignment = plate.assignments?.[0] || null;
      const latest_transfer = plate.transfers?.[0] || null;
      const vehicle = plate.status === 'in_use' ? plate.current_vehicle : latest_assignment?.vehicle;
      const owned_date = latest_transfer?.transfer_date || plate.created_at;
      const activity_date = plate.status === 'in_use' ? latest_assignment?.assigned_date : latest_assignment?.removed_date;

      return {
        ...plate,
        latest_assignment,
        latest_transfer,
        owned_date,
        activity_date,
        owner_company_label: this.renderCompany(plate.owner_company),
        vehicle_label: this.getVehicleLabel(vehicle),
      };
    });

    const columnFilters = this.parseColumnFilters(query);
    if (excludeFilterColumn) delete columnFilters[excludeFilterColumn];

    rows = rows.filter((row) => Object.entries(columnFilters).every(([field, values]) => {
      if (values.includes('__NO_MATCH__')) return false;
      const displayValue = this.getFilterDisplayValue(row, field);
      return values.includes(displayValue);
    }));

    return rows;
  }

  private compareRows(a: any, b: any, sortBy: string, direction: number): number {
    const dateFields = ['owned_date', 'activity_date', 'plate_expiry_date', 'plate_owned_date', 'created_at', 'updated_at'];
    if (dateFields.includes(sortBy)) {
      const aTime = a[sortBy] ? new Date(a[sortBy]).getTime() : 0;
      const bTime = b[sortBy] ? new Date(b[sortBy]).getTime() : 0;
      return (aTime - bTime) * direction;
    }

    const aValue = this.getFilterDisplayValue(a, sortBy);
    const bValue = this.getFilterDisplayValue(b, sortBy);
    return aValue.localeCompare(bValue, 'zh-Hant', { numeric: true }) * direction;
  }

  async create(dto: CreateVehiclePlateDto, userId?: number, ipAddress?: string) {
    const plateNumber = dto.plate_number?.trim();
    if (!plateNumber) throw new BadRequestException('必須輸入車牌號碼');

    const exists = await this.prisma.vehiclePlate.findUnique({ where: { plate_number: plateNumber } });
    if (exists) throw new BadRequestException('此車牌已存在');

    const result = await this.prisma.vehiclePlate.create({
      data: {
        plate_number: plateNumber,
        owner_company_id: Number(dto.owner_company_id),
        status: 'idle',
        plate_owned_date: dto.plate_owned_date ? new Date(dto.plate_owned_date) : null,
        plate_expiry_date: dto.plate_expiry_date ? new Date(dto.plate_expiry_date) : null,
        plate_notes: dto.plate_notes?.trim() || null,
      },
    });

    await this.log(userId, 'create', 'vehicle_plates', result.id, undefined, result, ipAddress);
    return this.findOne(result.id);
  }

  async findAll(query: VehiclePlateListQuery) {
    const hasPagination = query.page !== undefined || query.limit !== undefined;
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const sortBy = query.sortBy || 'plate_number';
    const direction = query.sortOrder?.toUpperCase() === 'DESC' ? -1 : 1;

    const rows = await this.getPlateRows(query);
    rows.sort((a, b) => this.compareRows(a, b, sortBy, direction));

    if (!hasPagination) return rows;

    const total = rows.length;
    const start = (page - 1) * limit;
    return {
      data: rows.slice(start, start + limit),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getFilterOptions(column: string, query: VehiclePlateListQuery): Promise<string[]> {
    const rows = await this.getPlateRows(query, column);
    const values = rows.map((row) => this.getFilterDisplayValue(row, column));
    return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'zh-Hant', { numeric: true }));
  }

  async findOne(id: number) {
    const plate = await this.prisma.vehiclePlate.findUnique({
      where: { id },
      include: {
        owner_company: true,
        current_vehicle: { include: { owner_company: true } },
        transfers: {
          include: { from_company: true, to_company: true },
          orderBy: { transfer_date: 'desc' },
        },
        assignments: {
          include: { vehicle: { include: { owner_company: true } } },
          orderBy: [{ assigned_date: 'desc' }, { created_at: 'desc' }],
        },
      },
    });
    if (!plate) throw new NotFoundException('車牌不存在');
    const latest_transfer = plate.transfers?.[0] || null;
    return {
      ...plate,
      owned_date: latest_transfer?.transfer_date || plate.created_at,
      owner_company_label: this.renderCompany(plate.owner_company),
    };
  }

  async assign(id: number, dto: AssignVehiclePlateDto, userId?: number, ipAddress?: string) {
    const assignedDate = new Date(dto.assigned_date);
    const result = await this.prisma.$transaction(async (tx) => {
      const plate = await tx.vehiclePlate.findUnique({ where: { id } });
      if (!plate) throw new NotFoundException('車牌不存在');
      const targetVehicle = await tx.vehicle.findUnique({ where: { id: Number(dto.vehicle_id) } });
      if (!targetVehicle || targetVehicle.deleted_at) throw new NotFoundException('車輛不存在');
      if (targetVehicle.status === 'scrapped') throw new BadRequestException('已劏車的車輛不能套牌');
      if (plate.current_vehicle_id === targetVehicle.id) throw new BadRequestException('此車牌已套用在該車輛');

      if (plate.current_vehicle_id) {
        await tx.vehiclePlateAssignment.updateMany({
          where: { plate_id: id, removed_date: null },
          data: { removed_date: assignedDate, notes: dto.notes || '套牌至另一車輛時自動拆牌' },
        });
        await tx.vehicle.update({
          where: { id: plate.current_vehicle_id },
          data: { current_plate_id: null },
        });
      }

      if (targetVehicle.current_plate_id && targetVehicle.current_plate_id !== id) {
        await tx.vehiclePlateAssignment.updateMany({
          where: { plate_id: targetVehicle.current_plate_id, vehicle_id: targetVehicle.id, removed_date: null },
          data: { removed_date: assignedDate, notes: '被新車牌取代時自動拆牌' },
        });
        await tx.vehiclePlate.update({
          where: { id: targetVehicle.current_plate_id },
          data: { status: 'idle', current_vehicle_id: null },
        });
      }

      await tx.vehiclePlateAssignment.create({
        data: { plate_id: id, vehicle_id: targetVehicle.id, assigned_date: assignedDate, notes: dto.notes },
      });
      await tx.vehicle.update({
        where: { id: targetVehicle.id },
        data: { current_plate_id: id, plate_number: plate.plate_number },
      });
      const updated = await tx.vehiclePlate.update({
        where: { id },
        data: { status: 'in_use', current_vehicle_id: targetVehicle.id, owner_company_id: targetVehicle.owner_company_id },
      });
      return updated;
    });

    await this.log(userId, 'assign_plate', 'vehicle_plates', id, undefined, result, ipAddress);
    return this.findOne(id);
  }

  async transfer(id: number, dto: TransferVehiclePlateDto, userId?: number, ipAddress?: string) {
    const before = await this.prisma.vehiclePlate.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('車牌不存在');
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.vehiclePlateTransfer.create({
        data: {
          plate_id: id,
          from_company_id: Number(dto.from_company_id),
          to_company_id: Number(dto.to_company_id),
          transfer_date: new Date(dto.transfer_date),
          notes: dto.notes,
        },
      });
      return tx.vehiclePlate.update({ where: { id }, data: { owner_company_id: Number(dto.to_company_id) } });
    });
    await this.log(userId, 'transfer_plate', 'vehicle_plates', id, before, result, ipAddress);
    return this.findOne(id);
  }

  async addAssignmentHistory(id: number, dto: ManualPlateAssignmentHistoryDto) {
    const plate = await this.prisma.vehiclePlate.findUnique({ where: { id } });
    if (!plate) throw new NotFoundException('車牌不存在');
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: Number(dto.vehicle_id) } });
    if (!vehicle) throw new NotFoundException('車輛不存在');
    await this.prisma.vehiclePlateAssignment.create({
      data: {
        plate_id: id,
        vehicle_id: Number(dto.vehicle_id),
        assigned_date: new Date(dto.assigned_date),
        removed_date: dto.removed_date ? new Date(dto.removed_date) : null,
        notes: dto.notes,
      },
    });
    return this.findOne(id);
  }

  async addTransferHistory(id: number, dto: ManualPlateTransferHistoryDto) {
    const plate = await this.prisma.vehiclePlate.findUnique({ where: { id } });
    if (!plate) throw new NotFoundException('車牌不存在');
    await this.prisma.vehiclePlateTransfer.create({
      data: {
        plate_id: id,
        from_company_id: Number(dto.from_company_id),
        to_company_id: Number(dto.to_company_id),
        transfer_date: new Date(dto.transfer_date),
        notes: dto.notes,
      },
    });
    return this.findOne(id);
  }

  async update(id: number, dto: UpdateVehiclePlateDto, userId?: number, ipAddress?: string) {
    const before = await this.prisma.vehiclePlate.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('車牌不存在');

    const data: any = {};
    if (dto.plate_expiry_date !== undefined) {
      data.plate_expiry_date = dto.plate_expiry_date ? new Date(dto.plate_expiry_date) : null;
    }
    if (dto.plate_owned_date !== undefined) {
      data.plate_owned_date = dto.plate_owned_date ? new Date(dto.plate_owned_date) : null;
    }
    if (dto.plate_notes !== undefined) {
      data.plate_notes = dto.plate_notes?.trim() || null;
    }

    const result = await this.prisma.vehiclePlate.update({
      where: { id },
      data,
    });

    await this.log(userId, 'update_plate', 'vehicle_plates', id, before, result, ipAddress);
    return this.findOne(id);
  }

  private async log(userId: number | undefined, action: string, targetTable: string, targetId: number, changesBefore?: any, changesAfter?: any, ipAddress?: string) {
    if (!userId) return;
    try {
      const auditAction = action === 'create' || action === 'delete' ? action : 'update';
      await this.auditLogsService.log({ userId, action: auditAction, targetTable, targetId, changesBefore: { ...changesBefore, _operation: action }, changesAfter, ipAddress });
    } catch (e) {
      console.error('Audit log error:', e);
    }
  }
}
