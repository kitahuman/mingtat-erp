import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EmployeePortalService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  // ── Employee Portal Login (phone OR username + password) ────────
  // Supports both employee phone login and admin username login for testing
  async loginByPhone(identifier: string, password: string) {
    // Try to find user by phone first, then by username
    let user = await this.prisma.user.findFirst({
      where: { phone: identifier, isActive: true },
    });

    if (!user) {
      // Fallback: try username (for admin accounts)
      user = await this.prisma.user.findFirst({
        where: { username: identifier, isActive: true },
      });
    }

    if (!user) {
      throw new UnauthorizedException('帳號或密碼錯誤');
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      throw new UnauthorizedException('帳號或密碼錯誤');
    }

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Find linked employee record
    let employee: any = null;
    if (user.employee_id) {
      employee = await this.prisma.employee.findUnique({
        where: { id: user.employee_id },
        select: { id: true, name_zh: true, name_en: true, emp_code: true, role: true, company_id: true },
      });
    } else if (user.phone) {
      // Try to find by phone (for employee accounts)
      employee = await this.prisma.employee.findFirst({
        where: { phone: user.phone },
        select: { id: true, name_zh: true, name_en: true, emp_code: true, role: true, company_id: true },
      });
    }
    // Note: Admin accounts may not have a linked employee record - that's OK

    const isAdmin = ['admin', 'superadmin', 'manager'].includes(user.role);

    const payload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      employeeId: employee?.id ?? null,
      portal: 'employee',
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        phone: user.phone,
        isAdmin,
        employeeId: employee?.id ?? null,
        employee,
      },
    };
  }

  // ── Get employee profile ───────────────────────────────────────
  async getEmployeeProfile(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    let employee = null;
    if (user.employee_id) {
      employee = await this.prisma.employee.findUnique({
        where: { id: user.employee_id },
        include: { company: { select: { id: true, name: true } } },
      });
    } else if (user.phone) {
      employee = await this.prisma.employee.findFirst({
        where: { phone: user.phone },
        include: { company: { select: { id: true, name: true } } },
      });
    }

    return { user, employee };
  }

  // ── Clock In / Out ─────────────────────────────────────────────
  async clockInOut(
    userId: number,
    data: {
      type: 'clock_in' | 'clock_out';
      photo_url?: string;
      latitude?: number;
      longitude?: number;
      address?: string;
      remarks?: string;
    },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    let employeeId: number | null = user.employee_id ?? null;
    if (!employeeId && user.phone) {
      const emp = await this.prisma.employee.findFirst({ where: { phone: user.phone } });
      employeeId = emp?.id ?? null;
    }
    if (!employeeId) throw new BadRequestException('找不到對應的員工記錄');

    const record = await this.prisma.employeeAttendance.create({
      data: {
        employee_id: employeeId,
        user_id: userId,
        type: data.type,
        timestamp: new Date(),
        photo_url: data.photo_url,
        latitude: data.latitude,
        longitude: data.longitude,
        address: data.address,
        remarks: data.remarks,
      },
    });

    return record;
  }

  // ── Get today's attendance ─────────────────────────────────────
  async getTodayAttendance(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    let employeeId: number | null = user.employee_id ?? null;
    if (!employeeId && user.phone) {
      const emp = await this.prisma.employee.findFirst({ where: { phone: user.phone } });
      employeeId = emp?.id ?? null;
    }
    if (!employeeId) return { records: [], employeeId: null };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const records = await this.prisma.employeeAttendance.findMany({
      where: {
        employee_id: employeeId,
        timestamp: { gte: today, lt: tomorrow },
      },
      orderBy: { timestamp: 'asc' },
    });

    return { records, employeeId };
  }

  // ── Get attendance history ─────────────────────────────────────
  async getAttendanceHistory(userId: number, query: { page?: number; limit?: number }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    let employeeId: number | null = user.employee_id ?? null;
    if (!employeeId && user.phone) {
      const emp = await this.prisma.employee.findFirst({ where: { phone: user.phone } });
      employeeId = emp?.id ?? null;
    }
    if (!employeeId) return { data: [], total: 0 };

    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    const [data, total] = await Promise.all([
      this.prisma.employeeAttendance.findMany({
        where: { employee_id: employeeId },
        orderBy: { timestamp: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.employeeAttendance.count({ where: { employee_id: employeeId } }),
    ]);

    return { data, total, page, limit };
  }

  // ── Submit Leave ───────────────────────────────────────────────
  async submitLeave(
    userId: number,
    data: {
      leave_type: 'sick' | 'annual';
      date_from: string;
      date_to: string;
      days: number;
      reason?: string;
    },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    let employeeId: number | null = user.employee_id ?? null;
    if (!employeeId && user.phone) {
      const emp = await this.prisma.employee.findFirst({ where: { phone: user.phone } });
      employeeId = emp?.id ?? null;
    }
    if (!employeeId) throw new BadRequestException('找不到對應的員工記錄');

    const leave = await this.prisma.employeeLeave.create({
      data: {
        employee_id: employeeId,
        user_id: userId,
        leave_type: data.leave_type,
        date_from: new Date(data.date_from),
        date_to: new Date(data.date_to),
        days: data.days,
        reason: data.reason,
        status: 'pending',
      },
    });

    return leave;
  }

  // ── Get Leave Records ──────────────────────────────────────────
  async getLeaveRecords(userId: number, query: { page?: number; limit?: number }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    let employeeId: number | null = user.employee_id ?? null;
    if (!employeeId && user.phone) {
      const emp = await this.prisma.employee.findFirst({ where: { phone: user.phone } });
      employeeId = emp?.id ?? null;
    }
    if (!employeeId) return { data: [], total: 0 };

    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    const [data, total] = await Promise.all([
      this.prisma.employeeLeave.findMany({
        where: { employee_id: employeeId },
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.employeeLeave.count({ where: { employee_id: employeeId } }),
    ]);

    return { data, total, page, limit };
  }

  // ── Submit Work Log (報工) ─────────────────────────────────────
  async submitWorkLog(userId: number, data: any) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    let employeeId: number | null = user.employee_id ?? null;
    if (!employeeId && user.phone) {
      const emp = await this.prisma.employee.findFirst({ where: { phone: user.phone } });
      employeeId = emp?.id ?? null;
    }

    const workLog = await this.prisma.workLog.create({
      data: {
        publisher_id: userId,
        employee_id: employeeId ?? undefined,
        status: 'editing',
        service_type: data.service_type,
        scheduled_date: data.scheduled_date ? new Date(data.scheduled_date) : new Date(),
        company_profile_id: data.company_profile_id ? Number(data.company_profile_id) : undefined,
        client_id: data.client_id ? Number(data.client_id) : undefined,
        quotation_id: data.quotation_id ? Number(data.quotation_id) : undefined,
        tonnage: data.tonnage,
        machine_type: data.machine_type,
        equipment_number: data.equipment_number,
        start_location: data.start_location,
        end_location: data.end_location,
        start_time: data.start_time,
        end_time: data.end_time,
        day_night: data.day_night,
        quantity: data.quantity ? Number(data.quantity) : undefined,
        unit: data.unit,
        goods_quantity: data.goods_quantity ? Number(data.goods_quantity) : undefined,
        remarks: data.remarks,
      },
    });

    return workLog;
  }

  // ── Get Work Logs for employee ─────────────────────────────────
  async getMyWorkLogs(userId: number, query: { page?: number; limit?: number }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    let employeeId: number | null = user.employee_id ?? null;
    if (!employeeId && user.phone) {
      const emp = await this.prisma.employee.findFirst({ where: { phone: user.phone } });
      employeeId = emp?.id ?? null;
    }

    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    const where: any = {};
    if (employeeId) {
      where.OR = [{ employee_id: employeeId }, { publisher_id: userId }];
    } else {
      where.publisher_id = userId;
    }

    const [data, total] = await Promise.all([
      this.prisma.workLog.findMany({
        where,
        include: {
          client: { select: { id: true, name: true } },
          employee: { select: { id: true, name_zh: true, name_en: true } },
        },
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.workLog.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  // ── Submit Expense (報銷) ──────────────────────────────────────
  async submitExpense(userId: number, data: any) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    let employeeId: number | null = user.employee_id ?? null;
    if (!employeeId && user.phone) {
      const emp = await this.prisma.employee.findFirst({ where: { phone: user.phone } });
      employeeId = emp?.id ?? null;
    }

    const expense = await this.prisma.expense.create({
      data: {
        date: data.date ? new Date(data.date) : new Date(),
        employee_id: employeeId ?? undefined,
        category_id: data.category_id ? Number(data.category_id) : undefined,
        item: data.item,
        supplier_name: data.supplier_name,
        total_amount: data.total_amount ? Number(data.total_amount) : 0,
        remarks: data.remarks,
      },
    });

    return expense;
  }

  // ── Get My Expenses ────────────────────────────────────────────
  async getMyExpenses(userId: number, query: { page?: number; limit?: number }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    let employeeId: number | null = user.employee_id ?? null;
    if (!employeeId && user.phone) {
      const emp = await this.prisma.employee.findFirst({ where: { phone: user.phone } });
      employeeId = emp?.id ?? null;
    }
    if (!employeeId) return { data: [], total: 0 };

    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    const [data, total] = await Promise.all([
      this.prisma.expense.findMany({
        where: { employee_id: employeeId },
        include: {
          category: { include: { parent: true } },
        },
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.expense.count({ where: { employee_id: employeeId } }),
    ]);

    return { data, total, page, limit };
  }

  // ── Get My Payrolls ────────────────────────────────────────────
  async getMyPayrolls(userId: number, query: { page?: number; limit?: number }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    let employeeId: number | null = user.employee_id ?? null;
    if (!employeeId && user.phone) {
      const emp = await this.prisma.employee.findFirst({ where: { phone: user.phone } });
      employeeId = emp?.id ?? null;
    }
    if (!employeeId) return { data: [], total: 0 };

    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    const [data, total] = await Promise.all([
      this.prisma.payroll.findMany({
        where: { employee_id: employeeId },
        include: { company_profile: { select: { id: true, chinese_name: true } } },
        orderBy: { period: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.payroll.count({ where: { employee_id: employeeId } }),
    ]);

    return { data, total, page, limit };
  }

  // ── Get Dashboard Summary ──────────────────────────────────────
  async getDashboard(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    let employeeId: number | null = user.employee_id ?? null;
    if (!employeeId && user.phone) {
      const emp = await this.prisma.employee.findFirst({ where: { phone: user.phone } });
      employeeId = emp?.id ?? null;
    }

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [todayAttendance, monthWorkLogs, pendingExpenses, pendingLeaves] = await Promise.all([
      employeeId
        ? this.prisma.employeeAttendance.findMany({
            where: { employee_id: employeeId, timestamp: { gte: today, lt: tomorrow } },
            orderBy: { timestamp: 'asc' },
          })
        : Promise.resolve([]),
      employeeId
        ? this.prisma.workLog.count({
            where: {
              employee_id: employeeId,
              scheduled_date: { gte: monthStart, lte: monthEnd },
            },
          })
        : Promise.resolve(0),
      employeeId
        ? this.prisma.expense.count({
            where: { employee_id: employeeId, paid_amount: 0 },
          })
        : Promise.resolve(0),
      employeeId
        ? this.prisma.employeeLeave.count({
            where: { employee_id: employeeId, status: 'pending' },
          })
        : Promise.resolve(0),
    ]);

    return {
      todayAttendance,
      monthWorkLogs,
      pendingExpenses,
      pendingLeaves,
      employeeId,
    };
  }

  // ── Create employee user account ───────────────────────────────
  async createEmployeeUser(data: {
    phone: string;
    displayName: string;
    employee_id?: number;
  }) {
    const defaultPassword = `Aa-${data.phone}`;
    const hashed = await bcrypt.hash(defaultPassword, 10);

    const existing = await this.prisma.user.findFirst({ where: { phone: data.phone } });
    if (existing) {
      throw new BadRequestException('該電話號碼已有帳號');
    }

    const user = await this.prisma.user.create({
      data: {
        username: `emp_${data.phone}`,
        password: hashed,
        displayName: data.displayName,
        role: 'worker',
        phone: data.phone,
        isActive: true,
        employee_id: data.employee_id,
      },
    });

    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      phone: user.phone,
      role: user.role,
    };
  }
}
