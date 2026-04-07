import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { GeoService } from '../geo/geo.service';

@Injectable()
export class EmployeePortalService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private geoService: GeoService,
  ) {}

  // ── Employee Portal Login ──────────────────────────────────────
  // Accepts: phone number (employee) OR username (admin/any user)
  // Strategy: try username first (works for all users), then try phone
  async loginByPhone(identifier: string, password: string) {
    let user: any = null;

    // 1. Try username lookup first (works for admin accounts, no extra columns needed)
    try {
      user = await this.prisma.user.findFirst({
        where: { username: identifier, isActive: true },
      });
    } catch {
      // ignore - column may not exist in old schema
    }

    // 2. If not found by username, try phone lookup
    if (!user) {
      try {
        user = await this.prisma.user.findFirst({
          where: { phone: identifier, isActive: true } as any,
        });
      } catch {
        // phone column may not exist yet (migration pending) - skip
      }
    }

    // 3. Auto-create account: if identifier looks like a phone number and
    //    an Employee record exists with that phone but no User yet, auto-create.
    if (!user) {
      try {
        // Only attempt auto-create if identifier is a phone number (digits only, 8+ chars)
        if (/^\d{8,}$/.test(identifier)) {
          const employee = await this.prisma.employee.findFirst({
            where: { phone: identifier },
          });
          if (employee) {
            // Verify the password matches the default pattern Aa-<phone>
            const defaultPassword = `Aa-${identifier}`;
            // Direct string comparison (password is plain text at this point)
            const passwordMatches = password === defaultPassword;
            if (passwordMatches) {
              // Auto-create the User account with default password
              const hashed = await bcrypt.hash(defaultPassword, 10);
              user = await this.prisma.user.create({
                data: {
                  username: `emp_${identifier}`,
                  password: hashed,
                  displayName: employee.name_zh || employee.name_en || identifier,
                  role: 'worker',
                  phone: identifier,
                  isActive: true,
                  employee_id: employee.id,
                } as any,
              });
            }
          }
        }
      } catch {
        // auto-create failed - fall through to UnauthorizedException
      }
    }

    if (!user) {
      throw new UnauthorizedException('帳號或密碼錯誤');
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      throw new UnauthorizedException('帳號或密碼錯誤');
    }

    // Update last login (best-effort, ignore errors)
    try {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
    } catch {
      // ignore if lastLoginAt column doesn't exist
    }

    // Find linked employee record via relation (best-effort)
    let employee: any = null;
    try {
      const userWithEmployee = await this.prisma.user.findUnique({
        where: { id: user.id },
        include: {
          employee: { select: { id: true, name_zh: true, name_en: true, emp_code: true, role: true, company_id: true } },
        },
      });
      employee = userWithEmployee?.employee ?? null;

      // Fallback: if no relation but phone matches, try phone lookup
      if (!employee && user.phone) {
        employee = await this.prisma.employee.findFirst({
          where: { phone: user.phone },
          select: { id: true, name_zh: true, name_en: true, emp_code: true, role: true, company_id: true },
        });
      }
    } catch {
      // employee lookup is optional - admin accounts may not have one
    }

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
        phone: user.phone ?? null,
        isAdmin,
        employeeId: employee?.id ?? null,
        employee,
      },
    };
  }

  // ── Helper: resolve employeeId for a user ─────────────────────
  private async resolveEmployeeId(user: any): Promise<number | null> {
    try {
      if (user.employee_id) return user.employee_id;
      if (user.phone) {
        const emp = await this.prisma.employee.findFirst({ where: { phone: user.phone } });
        return emp?.id ?? null;
      }
    } catch {
      // columns may not exist yet
    }
    return null;
  }

  // ── Get employee profile ───────────────────────────────────────
  async getEmployeeProfile(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        employee: {
          include: { company: { select: { id: true, name: true } } },
        },
      },
    });
    if (!user) throw new UnauthorizedException();

    let employee: any = user.employee ?? null;

    // Fallback: if no relation but phone matches
    if (!employee) {
      try {
        const employeeId = await this.resolveEmployeeId(user);
        if (employeeId) {
          employee = await this.prisma.employee.findUnique({
            where: { id: employeeId },
            include: { company: { select: { id: true, name: true } } },
          });
        }
      } catch {
        // ignore
      }
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

    const employeeId = await this.resolveEmployeeId(user);
    if (!employeeId) throw new BadRequestException('找不到對應的員工記錄，請聯絡管理員');

    // Auto reverse-geocode if we have coordinates but no address
    let address = data.address;
    if (!address && data.latitude != null && data.longitude != null) {
      try {
        const geo = await this.geoService.reverseGeocode(data.latitude, data.longitude);
        address = geo.address || undefined;
      } catch {
        // Geocoding failure should NOT block clock-in/out
      }
    }

    const record = await this.prisma.employeeAttendance.create({
      data: {
        employee_id: employeeId,
        user_id: userId,
        type: data.type,
        timestamp: new Date(),
        photo_url: data.photo_url,
        latitude: data.latitude,
        longitude: data.longitude,
        address: address,
        remarks: data.remarks,
      },
    });

    return record;
  }

  // ── Get today's attendance ─────────────────────────────────────
  async getTodayAttendance(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    const employeeId = await this.resolveEmployeeId(user);
    if (!employeeId) return { records: [], employeeId: null };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    try {
      const records = await this.prisma.employeeAttendance.findMany({
        where: {
          employee_id: employeeId,
          timestamp: { gte: today, lt: tomorrow },
        },
        orderBy: { timestamp: 'asc' },
      });
      return { records, employeeId };
    } catch {
      return { records: [], employeeId };
    }
  }

  // ── Get attendance history ─────────────────────────────────────
  async getAttendanceHistory(userId: number, query: { page?: number; limit?: number }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    const employeeId = await this.resolveEmployeeId(user);
    if (!employeeId) return { data: [], total: 0 };

    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    try {
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
    } catch {
      return { data: [], total: 0, page, limit };
    }
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

    const employeeId = await this.resolveEmployeeId(user);
    if (!employeeId) throw new BadRequestException('找不到對應的員工記錄，請聯絡管理員');

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

    const employeeId = await this.resolveEmployeeId(user);
    if (!employeeId) return { data: [], total: 0 };

    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    try {
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
    } catch {
      return { data: [], total: 0, page, limit };
    }
  }

  // ── Submit Work Log (報工) ─────────────────────────────────
  async submitWorkLog(userId: number, data: any) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    const employeeId = await this.resolveEmployeeId(user);

    // Handle unverified client: if client_id is a free-text name (not a number), treat as unverified
    let clientId: number | undefined = undefined;
    let unverifiedClientName: string | undefined = undefined;

    if (data.unverified_client_name) {
      // Explicit unverified client name field
      unverifiedClientName = String(data.unverified_client_name);
    } else if (data.client_id) {
      const parsed = Number(data.client_id);
      if (!isNaN(parsed) && parsed > 0) {
        clientId = parsed;
      } else {
        // Free-text client name entered by employee
        unverifiedClientName = String(data.client_id);
      }
    }

    const workLog = await this.prisma.workLog.create({
      data: {
        publisher_id: userId,
        employee_id: employeeId ?? undefined,
        status: 'editing',
        service_type: data.service_type,
        scheduled_date: data.scheduled_date ? new Date(data.scheduled_date) : new Date(),
        company_profile_id: data.company_profile_id ? Number(data.company_profile_id) : undefined,
        company_id: data.company_id ? Number(data.company_id) : undefined,
        client_id: clientId,
        unverified_client_name: unverifiedClientName,
        quotation_id: data.quotation_id ? Number(data.quotation_id) : undefined,
        tonnage: data.tonnage,
        machine_type: data.machine_type,
        equipment_number: data.equipment_number,
        start_location: data.start_location,
        end_location: data.end_location,
        start_time: data.start_time,
        end_time: data.end_time,
        day_night: data.day_night,
        // Engineering: quantity in days
        quantity: data.eng_quantity
          ? Number(data.eng_quantity)
          : data.quantity ? Number(data.quantity) : undefined,
        unit: data.eng_quantity ? '天' : data.unit,
        // OT hours
        ot_quantity: data.ot_hours ? Number(data.ot_hours) : undefined,
        ot_unit: data.ot_hours ? '小時' : undefined,
        goods_quantity: data.goods_quantity ? Number(data.goods_quantity) : undefined,
        work_order_no: data.work_order_no || undefined,
        receipt_no: data.receipt_no || undefined,
        remarks: data.remarks,
      },
    });

    return workLog;
  }

  // ── Get Work Logs for employee ─────────────────────────────────
  async getMyWorkLogs(userId: number, query: { page?: number; limit?: number }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    const employeeId = await this.resolveEmployeeId(user);

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

  // ── Submit Expense (報銷) ──────────────────────────────
  async submitExpense(userId: number, data: any) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    const employeeId = await this.resolveEmployeeId(user);
    // Calculate total from items if provided
    let totalAmount = data.total_amount ? Number(data.total_amount) : 0;
    const items: any[] = Array.isArray(data.items) ? data.items : [];
    if (items.length > 0) {
      const itemsTotal = items.reduce((sum: number, i: any) => sum + (Number(i.amount) || 0), 0);
      if (itemsTotal > 0) totalAmount = itemsTotal;
    }
    const expense = await this.prisma.expense.create({
      data: {
        date: data.date ? new Date(data.date) : new Date(),
        employee_id: employeeId ?? undefined,
        category_id: data.category_id ? Number(data.category_id) : undefined,
        item: data.item,
        supplier_name: data.supplier_name,
        total_amount: totalAmount,
        payment_method: data.payment_method || undefined,
        payment_ref: data.payment_ref || undefined,
        remarks: data.remarks,
        source: 'employee_portal',
        // Create line items if provided
        items: items.length > 0 ? {
          create: items
            .filter((i: any) => i.description?.trim())
            .map((i: any) => ({
              description: i.description,
              quantity: Number(i.quantity) || 1,
              unit_price: Number(i.unit_price) || 0,
              amount: Number(i.amount) || 0,
            })),
        } : undefined,
      },
      include: { items: true, category: { include: { parent: true } } },
    });
    return expense;
  }

  // ── Get My Expenses ────────────────────────────────────────────
  async getMyExpenses(userId: number, query: { page?: number; limit?: number }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    const employeeId = await this.resolveEmployeeId(user);
    if (!employeeId) return { data: [], total: 0 };

    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    try {
      const [data, total] = await Promise.all([
        this.prisma.expense.findMany({
          where: { employee_id: employeeId },
          include: {
            category: { include: { parent: true } },
            items: true,
          },
          orderBy: { date: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        this.prisma.expense.count({ where: { employee_id: employeeId } }),
      ]);
      return { data, total, page, limit };
    } catch {
      return { data: [], total: 0, page, limit };
    }
  }

  // ── Get My Payrolls ────────────────────────────────────────────
  async getMyPayrolls(userId: number, query: { page?: number; limit?: number }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    const employeeId = await this.resolveEmployeeId(user);
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

    const employeeId = await this.resolveEmployeeId(user);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Use Promise.allSettled to avoid one failing query breaking the whole dashboard
    const [attendanceResult, workLogsResult, expensesResult, leavesResult] =
      await Promise.allSettled([
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
              where: { employee_id: employeeId, status: 'pending' } as any,
            })
          : Promise.resolve(0),
        employeeId
          ? this.prisma.employeeLeave.count({
              where: { employee_id: employeeId, status: 'pending' },
            })
          : Promise.resolve(0),
      ]);

    return {
      todayAttendance: attendanceResult.status === 'fulfilled' ? attendanceResult.value : [],
      monthWorkLogs: workLogsResult.status === 'fulfilled' ? workLogsResult.value : 0,
      pendingExpenses: expensesResult.status === 'fulfilled' ? expensesResult.value : 0,
      pendingLeaves: leavesResult.status === 'fulfilled' ? leavesResult.value : 0,
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

    // Check for existing account by phone (best-effort)
    try {
      const existing = await this.prisma.user.findFirst({ where: { phone: data.phone } as any });
      if (existing) {
        throw new BadRequestException('該電話號碼已有帳號');
      }
    } catch (e: any) {
      if (e instanceof BadRequestException) throw e;
      // phone column may not exist - skip duplicate check
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
      } as any,
    });

    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      phone: (user as any).phone ?? null,
       role: user.role,
    };
  }

  // ── Get Employee Certificates ──────────────────────────────────────────────
  async getCertificates(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    const employeeId = await this.resolveEmployeeId(user);
    if (!employeeId) {
      return { certificates: [], cert_photos: {} };
    }
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        driving_license_no: true, driving_license_expiry: true, driving_license_class: true,
        approved_worker_cert_no: true, approved_worker_cert_expiry: true,
        green_card_no: true, green_card_expiry: true,
        construction_card_no: true, construction_card_expiry: true,
        earth_mover_cert_no: true, earth_mover_cert_expiry: true,
        excavator_cert_no: true, excavator_cert_expiry: true,
        crane_operator_cert_no: true, crane_operator_cert_expiry: true,
        lorry_crane_cert_no: true, lorry_crane_cert_expiry: true,
        crawler_crane_cert_no: true, crawler_crane_cert_expiry: true,
        hydraulic_crane_cert_no: true, hydraulic_crane_cert_expiry: true,
        airport_pass_no: true, airport_pass_expiry: true,
        gammon_pass_no: true, gammon_pass_expiry: true,
        leighton_pass_no: true, leighton_pass_expiry: true,
        confined_space_cert_no: true, confined_space_cert_expiry: true,
        compactor_cert_no: true, compactor_cert_expiry: true,
        slinging_silver_card_no: true, slinging_silver_card_expiry: true,
        craft_test_cert_no: true, craft_test_cert_expiry: true,
        compaction_load_cert_no: true, compaction_load_cert_expiry: true,
        aerial_platform_cert_no: true, aerial_platform_cert_expiry: true,
        site_rigging_a12_cert_no: true, site_rigging_a12_cert_expiry: true,
        slinging_signaler_a12s_cert_no: true, slinging_signaler_a12s_cert_expiry: true,
        zero_injury_cert_no: true, zero_injury_cert_expiry: true,
        designated_trade_safety_cert_no: true, designated_trade_safety_cert_expiry: true,
        small_loader_cert_expiry: true,
        safety_supervisor_cert_expiry: true,
        safe_work_procedure_cert_expiry: true,
        grinding_wheel_cert_expiry: true,
        ship_cargo_cert_expiry: true,
        arc_welding_cert_expiry: true,
        gas_welding_cert_expiry: true,
        clp_safety_cert_expiry: true,
        other_certificates: true,
        cert_photos: true,
      },
    }) as any;
    if (!employee) return { certificates: [], cert_photos: {} };

    const certPhotos = (employee.cert_photos as Record<string, string>) || {};

    const CERT_MAP: Array<{
      key: string; nameZh: string; nameEn: string;
      no: string | null; expiry: Date | null; extra?: string | null;
    }> = [
      { key: 'driving_license', nameZh: '\u99d5\u99db\u57f7\u7167', nameEn: 'Driving License', no: employee.driving_license_no, expiry: employee.driving_license_expiry, extra: employee.driving_license_class ? `\u8eca\u7a2e: ${employee.driving_license_class}` : null },
      { key: 'approved_worker_cert', nameZh: '\u5efa\u9020\u696d\u5de5\u4eba\u8a3b\u518a\u8b49', nameEn: 'Approved Worker Cert', no: employee.approved_worker_cert_no, expiry: employee.approved_worker_cert_expiry },
      { key: 'green_card', nameZh: '\u7da0\u5361', nameEn: 'Green Card', no: employee.green_card_no, expiry: employee.green_card_expiry },
      { key: 'construction_card', nameZh: '\u5efa\u9020\u696d\u5de5\u4eba\u8b49', nameEn: 'Construction Card', no: employee.construction_card_no, expiry: employee.construction_card_expiry },
      { key: 'earth_mover_cert', nameZh: '\u571f\u5de5\u6a5f\u68b0\u64cd\u4f5c\u8b49', nameEn: 'Earth Mover Cert', no: employee.earth_mover_cert_no, expiry: employee.earth_mover_cert_expiry },
      { key: 'excavator_cert', nameZh: '\u6316\u6398\u6a5f\u8b49', nameEn: 'Excavator Cert', no: employee.excavator_cert_no, expiry: employee.excavator_cert_expiry },
      { key: 'crane_operator_cert', nameZh: '\u8d77\u91cd\u6a5f\u64cd\u4f5c\u8b49', nameEn: 'Crane Operator Cert', no: employee.crane_operator_cert_no, expiry: employee.crane_operator_cert_expiry },
      { key: 'lorry_crane_cert', nameZh: '\u968e\u53f0\u8d77\u91cd\u6a5f\u8b49', nameEn: 'Lorry Crane Cert', no: employee.lorry_crane_cert_no, expiry: employee.lorry_crane_cert_expiry },
      { key: 'crawler_crane_cert', nameZh: '\u5c65\u5e36\u5f0f\u8d77\u91cd\u6a5f\u8b49', nameEn: 'Crawler Crane Cert', no: employee.crawler_crane_cert_no, expiry: employee.crawler_crane_cert_expiry },
      { key: 'hydraulic_crane_cert', nameZh: '\u6db2\u58d3\u8d77\u91cd\u6a5f\u8b49', nameEn: 'Hydraulic Crane Cert', no: employee.hydraulic_crane_cert_no, expiry: employee.hydraulic_crane_cert_expiry },
      { key: 'airport_pass', nameZh: '\u6a5f\u5834\u901a\u884c\u8b49', nameEn: 'Airport Pass', no: employee.airport_pass_no, expiry: employee.airport_pass_expiry },
      { key: 'gammon_pass', nameZh: 'Gammon \u901a\u884c\u8b49', nameEn: 'Gammon Pass', no: employee.gammon_pass_no, expiry: employee.gammon_pass_expiry },
      { key: 'leighton_pass', nameZh: 'Leighton \u901a\u884c\u8b49', nameEn: 'Leighton Pass', no: employee.leighton_pass_no, expiry: employee.leighton_pass_expiry },
      { key: 'confined_space_cert', nameZh: '\u5c01\u9589\u7a7a\u9593\u8b49', nameEn: 'Confined Space Cert', no: employee.confined_space_cert_no, expiry: employee.confined_space_cert_expiry },
      { key: 'compactor_cert', nameZh: '\u58d3\u8def\u6a5f\u8b49', nameEn: 'Compactor Cert', no: employee.compactor_cert_no, expiry: employee.compactor_cert_expiry },
      { key: 'slinging_silver_card', nameZh: '\u7d54\u7d22\u9280\u5361', nameEn: 'Slinging Silver Card', no: employee.slinging_silver_card_no, expiry: employee.slinging_silver_card_expiry },
      { key: 'craft_test_cert', nameZh: '\u5de5\u85dd\u6e2c\u8a66\u8b49', nameEn: 'Craft Test Cert', no: employee.craft_test_cert_no, expiry: employee.craft_test_cert_expiry },
      { key: 'compaction_load_cert', nameZh: '\u58d3\u5b9e\u8ca0\u8377\u8b49', nameEn: 'Compaction Load Cert', no: employee.compaction_load_cert_no, expiry: employee.compaction_load_cert_expiry },
      { key: 'aerial_platform_cert', nameZh: '\u9ad8\u7a7a\u4f5c\u696d\u5e73\u53f0\u8b49', nameEn: 'Aerial Platform Cert', no: employee.aerial_platform_cert_no, expiry: employee.aerial_platform_cert_expiry },
      { key: 'site_rigging_a12_cert', nameZh: 'A12 \u5de5\u5730\u7d51\u7d22\u8b49', nameEn: 'Site Rigging A12 Cert', no: employee.site_rigging_a12_cert_no, expiry: employee.site_rigging_a12_cert_expiry },
      { key: 'slinging_signaler_a12s_cert', nameZh: 'A12S \u7d51\u7d22\u4fe1\u865f\u8b49', nameEn: 'Slinging Signaler A12S Cert', no: employee.slinging_signaler_a12s_cert_no, expiry: employee.slinging_signaler_a12s_cert_expiry },
      { key: 'zero_injury_cert', nameZh: '\u96f6\u50b7\u5bb3\u8b49', nameEn: 'Zero Injury Cert', no: employee.zero_injury_cert_no, expiry: employee.zero_injury_cert_expiry },
      { key: 'designated_trade_safety_cert', nameZh: '\u6307\u5b9a\u884c\u696d\u5b89\u5168\u8b49', nameEn: 'Designated Trade Safety Cert', no: employee.designated_trade_safety_cert_no, expiry: employee.designated_trade_safety_cert_expiry },
      { key: 'small_loader_cert', nameZh: '\u5c0f\u578b\u88dd\u8f09\u6a5f\u8b49', nameEn: 'Small Loader Cert', no: null, expiry: employee.small_loader_cert_expiry },
      { key: 'safety_supervisor_cert', nameZh: '\u5b89\u5168\u76e3\u7763\u8b49', nameEn: 'Safety Supervisor Cert', no: null, expiry: employee.safety_supervisor_cert_expiry },
      { key: 'safe_work_procedure_cert', nameZh: '\u5b89\u5168\u5de5\u4f5c\u7a0b\u5e8f\u8b49', nameEn: 'Safe Work Procedure Cert', no: null, expiry: employee.safe_work_procedure_cert_expiry },
      { key: 'grinding_wheel_cert', nameZh: '\u7814\u5edf\u8b49', nameEn: 'Grinding Wheel Cert', no: null, expiry: employee.grinding_wheel_cert_expiry },
      { key: 'ship_cargo_cert', nameZh: '\u8239\u8ca8\u8b49', nameEn: 'Ship Cargo Cert', no: null, expiry: employee.ship_cargo_cert_expiry },
      { key: 'arc_welding_cert', nameZh: '\u96fb\u5f27\u7126\u63a5\u8b49', nameEn: 'Arc Welding Cert', no: null, expiry: employee.arc_welding_cert_expiry },
      { key: 'gas_welding_cert', nameZh: '\u6c23\u9ad4\u7126\u63a5\u8b49', nameEn: 'Gas Welding Cert', no: null, expiry: employee.gas_welding_cert_expiry },
      { key: 'clp_safety_cert', nameZh: 'CLP \u5b89\u5168\u8b49', nameEn: 'CLP Safety Cert', no: null, expiry: employee.clp_safety_cert_expiry },
    ];

    const certificates = CERT_MAP
      .filter(c => c.no || c.expiry || certPhotos[c.key])
      .map(c => ({
        key: c.key,
        name_zh: c.nameZh,
        name_en: c.nameEn,
        cert_no: c.no || null,
        expiry_date: c.expiry || null,
        extra: c.extra || null,
        photo_url: certPhotos[c.key] || null,
      }));

    return { certificates, cert_photos: certPhotos };
  }

  // ── Update Certificate Photo ──────────────────────────────────────────────
  async updateCertPhoto(userId: number, certKey: string, photoUrl: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    const employeeId = await this.resolveEmployeeId(user);
    if (!employeeId) throw new BadRequestException('\u54e1\u5de5\u8cc7\u6599\u4e0d\u5b58\u5728');

    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { cert_photos: true },
    }) as any;

    const existing = (employee?.cert_photos as Record<string, string>) || {};
    const updated = { ...existing, [certKey]: photoUrl };

    await this.prisma.employee.update({
      where: { id: employeeId },
      data: { cert_photos: updated } as any,
    });

    return { success: true, cert_photos: updated };
  }

  // ── Get Expiring Certificates (for dashboard) ──────────────────────────────
  async getExpiringCerts(userId: number, daysAhead = 90) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    const employeeId = await this.resolveEmployeeId(user);
    if (!employeeId) return { expiring: [] };

    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        driving_license_expiry: true, approved_worker_cert_expiry: true,
        green_card_expiry: true, construction_card_expiry: true,
        earth_mover_cert_expiry: true, excavator_cert_expiry: true,
        crane_operator_cert_expiry: true, lorry_crane_cert_expiry: true,
        crawler_crane_cert_expiry: true, hydraulic_crane_cert_expiry: true,
        airport_pass_expiry: true, gammon_pass_expiry: true,
        leighton_pass_expiry: true, confined_space_cert_expiry: true,
        compactor_cert_expiry: true, slinging_silver_card_expiry: true,
        craft_test_cert_expiry: true, compaction_load_cert_expiry: true,
        aerial_platform_cert_expiry: true, site_rigging_a12_cert_expiry: true,
        slinging_signaler_a12s_cert_expiry: true, zero_injury_cert_expiry: true,
        designated_trade_safety_cert_expiry: true, small_loader_cert_expiry: true,
        safety_supervisor_cert_expiry: true, safe_work_procedure_cert_expiry: true,
        grinding_wheel_cert_expiry: true, ship_cargo_cert_expiry: true,
        arc_welding_cert_expiry: true, gas_welding_cert_expiry: true,
        clp_safety_cert_expiry: true,
      },
    }) as any;
    if (!employee) return { expiring: [] };

    const now = new Date();
    const cutoff = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

    const EXPIRY_MAP: Array<{ key: string; nameZh: string; nameEn: string; expiry: Date | null }> = [
      { key: 'driving_license', nameZh: '\u99d5\u99db\u57f7\u7167', nameEn: 'Driving License', expiry: employee.driving_license_expiry },
      { key: 'approved_worker_cert', nameZh: '\u5efa\u9020\u696d\u5de5\u4eba\u8a3b\u518a\u8b49', nameEn: 'Approved Worker Cert', expiry: employee.approved_worker_cert_expiry },
      { key: 'green_card', nameZh: '\u7da0\u5361', nameEn: 'Green Card', expiry: employee.green_card_expiry },
      { key: 'construction_card', nameZh: '\u5efa\u9020\u696d\u5de5\u4eba\u8b49', nameEn: 'Construction Card', expiry: employee.construction_card_expiry },
      { key: 'earth_mover_cert', nameZh: '\u571f\u5de5\u6a5f\u68b0\u64cd\u4f5c\u8b49', nameEn: 'Earth Mover Cert', expiry: employee.earth_mover_cert_expiry },
      { key: 'excavator_cert', nameZh: '\u6316\u6398\u6a5f\u8b49', nameEn: 'Excavator Cert', expiry: employee.excavator_cert_expiry },
      { key: 'crane_operator_cert', nameZh: '\u8d77\u91cd\u6a5f\u64cd\u4f5c\u8b49', nameEn: 'Crane Operator Cert', expiry: employee.crane_operator_cert_expiry },
      { key: 'lorry_crane_cert', nameZh: '\u968e\u53f0\u8d77\u91cd\u6a5f\u8b49', nameEn: 'Lorry Crane Cert', expiry: employee.lorry_crane_cert_expiry },
      { key: 'airport_pass', nameZh: '\u6a5f\u5834\u901a\u884c\u8b49', nameEn: 'Airport Pass', expiry: employee.airport_pass_expiry },
      { key: 'confined_space_cert', nameZh: '\u5c01\u9589\u7a7a\u9593\u8b49', nameEn: 'Confined Space Cert', expiry: employee.confined_space_cert_expiry },
      { key: 'aerial_platform_cert', nameZh: '\u9ad8\u7a7a\u4f5c\u696d\u5e73\u53f0\u8b49', nameEn: 'Aerial Platform Cert', expiry: employee.aerial_platform_cert_expiry },
      { key: 'safety_supervisor_cert', nameZh: '\u5b89\u5168\u76e3\u7763\u8b49', nameEn: 'Safety Supervisor Cert', expiry: employee.safety_supervisor_cert_expiry },
    ];

    const expiring = EXPIRY_MAP
      .filter(c => c.expiry && new Date(c.expiry) <= cutoff)
      .map(c => {
        const expiryDate = new Date(c.expiry!);
        const daysLeft = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return {
          key: c.key,
          name_zh: c.nameZh,
          name_en: c.nameEn,
          expiry_date: c.expiry,
          days_left: daysLeft,
          is_expired: daysLeft < 0,
        };
      })
      .sort((a, b) => a.days_left - b.days_left);

    return { expiring };
  }

  // ── Bulk Create Employee Accounts ─────────────────────────────────────────
  // Creates User accounts for all employees that have a phone number but no User yet.
  async bulkCreateEmployeeAccounts() {
    // Get all employees with phone numbers
    const employees = await this.prisma.employee.findMany({
      where: { phone: { not: null } },
      select: { id: true, phone: true, name_zh: true, name_en: true },
    });

    const results: { created: any[]; skipped: any[]; errors: any[] } = {
      created: [],
      skipped: [],
      errors: [],
    };

    for (const emp of employees) {
      if (!emp.phone) continue;
      try {
        // Check if User already exists with this phone
        const existing = await this.prisma.user.findFirst({
          where: { phone: emp.phone } as any,
        });
        if (existing) {
          results.skipped.push({ employee_id: emp.id, phone: emp.phone, name: emp.name_zh || emp.name_en, reason: '帳號已存在' });
          continue;
        }

        // Also check by username pattern emp_<phone>
        const existingByUsername = await this.prisma.user.findFirst({
          where: { username: `emp_${emp.phone}` },
        });
        if (existingByUsername) {
          results.skipped.push({ employee_id: emp.id, phone: emp.phone, name: emp.name_zh || emp.name_en, reason: 'username 已存在' });
          continue;
        }

        const defaultPassword = `Aa-${emp.phone}`;
        const hashed = await bcrypt.hash(defaultPassword, 10);
        const user = await this.prisma.user.create({
          data: {
            username: `emp_${emp.phone}`,
            password: hashed,
            displayName: emp.name_zh || emp.name_en || emp.phone,
            role: 'worker',
            phone: emp.phone,
            isActive: true,
            employee_id: emp.id,
          } as any,
        });
        results.created.push({
          employee_id: emp.id,
          user_id: user.id,
          phone: emp.phone,
          name: emp.name_zh || emp.name_en,
          username: user.username,
          default_password: defaultPassword,
        });
      } catch (e: any) {
        results.errors.push({ employee_id: emp.id, phone: emp.phone, name: emp.name_zh || emp.name_en, error: e?.message ?? 'Unknown error' });
      }
    }

    return {
      total_employees: employees.length,
      created_count: results.created.length,
      skipped_count: results.skipped.length,
      error_count: results.errors.length,
      created: results.created,
      skipped: results.skipped,
      errors: results.errors,
    };
  }
}
