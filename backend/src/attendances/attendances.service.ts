import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AttendancesService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: {
    page?: number;
    limit?: number;
    search?: string;
    employee_id?: number;
    date_from?: string;
    date_to?: string;
    type?: string;
    sortBy?: string;
    sortOrder?: string;
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    const where: any = {};

    if (query.employee_id) {
      where.employee_id = Number(query.employee_id);
    }

    if (query.type) {
      where.type = query.type;
    }

    if (query.date_from || query.date_to) {
      where.timestamp = {};
      if (query.date_from) {
        where.timestamp.gte = new Date(query.date_from);
      }
      if (query.date_to) {
        // Include the full end day
        const end = new Date(query.date_to);
        end.setHours(23, 59, 59, 999);
        where.timestamp.lte = end;
      }
    }

    if (query.search) {
      where.OR = [
        { employee: { name_zh: { contains: query.search, mode: 'insensitive' } } },
        { employee: { name_en: { contains: query.search, mode: 'insensitive' } } },
        { employee: { emp_code: { contains: query.search, mode: 'insensitive' } } },
        { address: { contains: query.search, mode: 'insensitive' } },
        { remarks: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const allowedSortFields = ['id', 'timestamp', 'type', 'created_at'];
    const sortBy = allowedSortFields.includes(query.sortBy || '') ? query.sortBy! : 'timestamp';
    const sortOrder = query.sortOrder?.toUpperCase() === 'ASC' ? 'asc' : 'desc';

    const [data, total] = await Promise.all([
      this.prisma.employeeAttendance.findMany({
        where,
        include: {
          employee: {
            select: { id: true, name_zh: true, name_en: true, emp_code: true, role: true, employee_is_temporary: true },
          },
          mid_shift_approver: {
            select: { id: true, name_zh: true },
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.employeeAttendance.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number) {
    const record = await this.prisma.employeeAttendance.findUnique({
      where: { id },
      include: {
        employee: {
          select: { id: true, name_zh: true, name_en: true, emp_code: true, role: true, employee_is_temporary: true },
        },
        mid_shift_approver: {
          select: { id: true, name_zh: true },
        },
      },
    });
    if (!record) throw new NotFoundException('打卡記錄不存在');
    return record;
  }

  async update(id: number, dto: any) {
    const existing = await this.prisma.employeeAttendance.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('打卡記錄不存在');
    const { id: _id, created_at, updated_at, employee, mid_shift_approver, ...updateData } = dto;
    // Convert timestamp string to Date if provided
    if (updateData.timestamp && typeof updateData.timestamp === 'string') {
      updateData.timestamp = new Date(updateData.timestamp);
    }
    // Ensure employee_id is a number if provided
    if (updateData.employee_id !== undefined) {
      updateData.employee_id = Number(updateData.employee_id);
    }
    return this.prisma.employeeAttendance.update({
      where: { id },
      data: updateData,
      include: {
        employee: {
          select: { id: true, name_zh: true, name_en: true, emp_code: true, role: true, employee_is_temporary: true },
        },
      },
    });
  }

  async remove(id: number) {
    const existing = await this.prisma.employeeAttendance.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('打卡記錄不存在');
    await this.prisma.employeeAttendance.delete({ where: { id } });
    return { success: true };
  }
}
