import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PrismaService } from '../prisma/prisma.service';
import { AssignVehiclePlateDto, ManualPlateAssignmentHistoryDto, ManualPlateTransferHistoryDto, TransferVehiclePlateDto } from './dto/vehicle-plate.dto';

@Injectable()
export class VehiclePlatesService {
  constructor(private prisma: PrismaService, private readonly auditLogsService: AuditLogsService) {}

  async findAll(query: { status?: string; search?: string; owner_company_id?: number }) {
    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.owner_company_id) where.owner_company_id = Number(query.owner_company_id);
    if (query.search) where.plate_number = { contains: query.search, mode: 'insensitive' };

    const plates = await this.prisma.vehiclePlate.findMany({
      where,
      include: {
        owner_company: true,
        current_vehicle: { include: { owner_company: true } },
        assignments: {
          include: { vehicle: { include: { owner_company: true } } },
          orderBy: [{ removed_date: 'desc' }, { assigned_date: 'desc' }],
          take: 1,
        },
      },
      orderBy: [{ status: 'asc' }, { plate_number: 'asc' }],
    });

    return plates.map((plate) => ({
      ...plate,
      latest_assignment: plate.assignments?.[0] || null,
    }));
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
    return plate;
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
