import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LeavesService {
  constructor(private prisma: PrismaService, private readonly auditLogsService: AuditLogsService) {}

  async findAll(query: {
    page?: number;
    limit?: number;
    search?: string;
    employee_id?: number;
    leave_type?: string;
    status?: string;
    date_from?: string;
    date_to?: string;
    sortBy?: string;
    sortOrder?: string;
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    const where: any = {};

    if (query.employee_id) {
      where.employee_id = Number(query.employee_id);
    }

    if (query.leave_type) {
      where.leave_type = query.leave_type;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.date_from || query.date_to) {
      where.date_from = {};
      if (query.date_from) {
        where.date_from.gte = new Date(query.date_from);
      }
      if (query.date_to) {
        where.date_from.lte = new Date(query.date_to);
      }
    }

    if (query.search) {
      where.OR = [
        { employee: { name_zh: { contains: query.search, mode: 'insensitive' } } },
        { employee: { name_en: { contains: query.search, mode: 'insensitive' } } },
        { employee: { emp_code: { contains: query.search, mode: 'insensitive' } } },
        { reason: { contains: query.search, mode: 'insensitive' } },
        { remarks: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const allowedSortFields = ['id', 'date_from', 'date_to', 'days', 'status', 'leave_type', 'created_at'];
    const sortBy = allowedSortFields.includes(query.sortBy || '') ? query.sortBy! : 'created_at';
    const sortOrder = query.sortOrder?.toUpperCase() === 'ASC' ? 'asc' : 'desc';

    const [data, total] = await Promise.all([
      this.prisma.employeeLeave.findMany({
        where,
        include: {
          employee: {
            select: { id: true, name_zh: true, name_en: true, emp_code: true },
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.employeeLeave.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number) {
    const record = await this.prisma.employeeLeave.findUnique({
      where: { id },
      include: {
        employee: {
          select: { id: true, name_zh: true, name_en: true, emp_code: true },
        },
      },
    });
    if (!record) throw new NotFoundException('請假記錄不存在');
    return record;
  }

  async update(id: number, dto: any, userId?: number) {
    const existing = await this.prisma.employeeLeave.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('請假記錄不存在');
    const { id: _id, created_at, updated_at, employee, ...updateData } = dto;
    const updated = await this.prisma.employeeLeave.update({ where: { id }, data: updateData });
    if (userId) {
      try {
        await this.auditLogsService.log({
          userId,
          action: 'update',
          targetTable: 'leaves',
          targetId: id,
          changesBefore: existing,
          changesAfter: updated,
        });
      } catch (e) { console.error('Audit log error:', e); }
    }
    return updated;
  }

  async approve(id: number, approverId: number) {
    const existing = await this.prisma.employeeLeave.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('請假記錄不存在');
    return this.prisma.employeeLeave.update({
      where: { id },
      data: {
        status: 'approved',
        approved_by: approverId,
        approved_at: new Date(),
      },
    });
  }

  async reject(id: number, approverId: number, remarks?: string) {
    const existing = await this.prisma.employeeLeave.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('請假記錄不存在');
    return this.prisma.employeeLeave.update({
      where: { id },
      data: {
        status: 'rejected',
        approved_by: approverId,
        approved_at: new Date(),
        remarks: remarks,
      },
    });
  }

  async remove(id: number, userId?: number) {
    const existing = await this.prisma.employeeLeave.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('請假記錄不存在');
    if (userId) {
      try {
        await this.auditLogsService.log({
          userId,
          action: 'delete',
          targetTable: 'leaves',
          targetId: id,
          changesBefore: existing,
        });
      } catch (e) { console.error('Audit log error:', e); }
    }
    await this.prisma.employeeLeave.delete({ where: { id } });
    return { success: true };
  }
}
