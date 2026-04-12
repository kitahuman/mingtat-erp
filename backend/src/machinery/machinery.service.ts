import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MachineryService {
  constructor(private prisma: PrismaService, private readonly auditLogsService: AuditLogsService) {}

  async simple() {
    const machines = await this.prisma.machinery.findMany({
      where: { status: 'active' },
      select: { id: true, machine_code: true, machine_type: true, tonnage: true },
      orderBy: { machine_code: 'asc' },
    });
    return machines.map(m => ({
      value: m.machine_code,
      label: m.machine_code,
      type: m.machine_type,
      tonnage: m.tonnage ? String(m.tonnage) : null,
      category: 'machinery',
    }));
  }

  async findAll(query: {
    page?: number; limit?: number; search?: string;
    machine_type?: string; owner_company_id?: number; status?: string;
    sortBy?: string; sortOrder?: string;
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const where: any = {};

    if (query.machine_type) where.machine_type = query.machine_type;
    if (query.owner_company_id) where.owner_company_id = Number(query.owner_company_id);
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { machine_code: { contains: query.search, mode: 'insensitive' } },
        { brand: { contains: query.search, mode: 'insensitive' } },
        { model: { contains: query.search, mode: 'insensitive' } },
        { serial_number: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const allowedSortFields = ['machine_code', 'machine_type', 'brand', 'model', 'tonnage', 'inspection_cert_expiry', 'insurance_expiry', 'status', 'id', 'created_at', 'plate_number'];
    const sortBy = allowedSortFields.includes(query.sortBy || '') ? query.sortBy! : 'machine_code';
    const sortOrder = query.sortOrder?.toUpperCase() === 'DESC' ? 'desc' : 'asc';

    const [data, total] = await Promise.all([
      this.prisma.machinery.findMany({
        where,
        include: { owner_company: true },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.machinery.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number) {
    const m = await this.prisma.machinery.findUnique({
      where: { id },
      include: {
        owner_company: true,
        transfers: {
          include: { from_company: true, to_company: true },
          orderBy: { transfer_date: 'desc' },
        },
      },
    });
    if (!m) throw new NotFoundException('機械不存在');
    return m;
  }

  async create(dto: any, userId?: number) {
    const { owner_company, transfers, ...data } = dto;
    const saved = await this.prisma.machinery.create({ data });
    if (userId) {
      try {
        await this.auditLogsService.log({
          userId,
          action: 'create',
          targetTable: 'machinery',
          targetId: saved.id,
          changesAfter: saved,
        });
      } catch (e) { console.error('Audit log error:', e); }
    }
    return this.findOne(saved.id);
  }

  async update(id: number, dto: any, userId?: number) {
    const existing = await this.prisma.machinery.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('機械不存在');
    const { transfers, owner_company, created_at, updated_at, id: _id, ...updateData } = dto;

    // 日期欄位：字串轉 Date，空值轉 null
    const dateFields = ['inspection_cert_expiry', 'insurance_expiry'];
    for (const field of dateFields) {
      if (field in updateData) {
        updateData[field] = updateData[field] ? new Date(updateData[field]) : null;
      }
    }
    // tonnage: 轉數字
    if ('tonnage' in updateData) {
      updateData.tonnage = updateData.tonnage != null && updateData.tonnage !== '' ? Number(updateData.tonnage) : null;
    }

    const updated = await this.prisma.machinery.update({ where: { id }, data: updateData });
    if (userId) {
      try {
        await this.auditLogsService.log({
          userId,
          action: 'update',
          targetTable: 'machinery',
          targetId: id,
          changesBefore: existing,
          changesAfter: updated,
        });
      } catch (e) { console.error('Audit log error:', e); }
    }
    return this.findOne(id);
  }

  async transferMachinery(id: number, dto: { from_company_id: number; to_company_id: number; transfer_date: string; notes?: string }) {
    await this.prisma.machineryTransfer.create({
      data: {
        machinery_id: id,
        from_company_id: dto.from_company_id,
        to_company_id: dto.to_company_id,
        transfer_date: new Date(dto.transfer_date),
        notes: dto.notes,
      },
    });
    await this.prisma.machinery.update({
      where: { id },
      data: { owner_company_id: dto.to_company_id },
    });
    return this.findOne(id);
  }

  async remove(id: number, userId?: number) {
    const existing = await this.prisma.machinery.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('機械不存在');
    if (userId) {
      try {
        await this.auditLogsService.log({
          userId,
          action: 'delete',
          targetTable: 'machinery',
          targetId: id,
          changesBefore: existing,
        });
      } catch (e) { console.error('Audit log error:', e); }
    }
    await this.prisma.machinery.delete({ where: { id } });
    return { message: '刪除成功' };
  }

}