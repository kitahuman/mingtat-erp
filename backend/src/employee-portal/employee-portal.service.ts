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
          // Only auto-create accounts for active (in-service) employees.
          // Employees with status 'inactive' are terminated and must not get an account.
          if (employee && employee.status === 'active') {
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
        canCompanyClock: (user as any).user_can_company_clock ?? false,
        can_approve_mid_shift: (user as any).can_approve_mid_shift ?? false,
        can_daily_report: (user as any).can_daily_report ?? false,
        can_acceptance_report: (user as any).can_acceptance_report ?? false,
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

  // ── Clock In / Out ────────────────────────────────────────────────────────────
  async clockInOut(
    userId: number,
    data: {
      type: 'clock_in' | 'clock_out';
      photo_url?: string;
      attendance_photo_base64?: string;
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
        attendance_photo_base64: data.attendance_photo_base64,
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
      },
    });
    return leave;
  }

  async getLeaveRecords(userId: number, query: { page?: number; limit?: number }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    const employeeId = await this.resolveEmployeeId(user);
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

  // ── Work Logs (報工) ───────────────────────────────────────────
  async submitWorkLog(userId: number, data: any) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    const employeeId = await this.resolveEmployeeId(user);
    if (!employeeId) throw new BadRequestException('找不到對應的員工記錄');

    // Create work log via prisma
    const { id, created_at, updated_at, ...workLogData } = data;
    return this.prisma.workLog.create({
      data: {
        ...workLogData,
        employee_id: employeeId,
        user_id: userId,
        scheduled_date: data.scheduled_date ? new Date(data.scheduled_date) : new Date(),
      },
    });
  }

  async getMyWorkLogs(userId: number, query: { page?: number; limit?: number }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    const employeeId = await this.resolveEmployeeId(user);
    if (!employeeId) return { data: [], total: 0 };

    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    const [data, total] = await Promise.all([
      this.prisma.workLog.findMany({
        where: { employee_id: employeeId },
        orderBy: { scheduled_date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.workLog.count({ where: { employee_id: employeeId } }),
    ]);
    return { data, total, page, limit };
  }

  // ── Expenses (報銷) ────────────────────────────────────────────
  async submitExpense(userId: number, data: any) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    const employeeId = await this.resolveEmployeeId(user);
    if (!employeeId) throw new BadRequestException('找不到對應的員工記錄');

    const { id, created_at, updated_at, items, ...expenseData } = data;
    return this.prisma.expense.create({
      data: {
        ...expenseData,
        employee_id: employeeId,
        expense_date: data.expense_date ? new Date(data.expense_date) : new Date(),
        items: {
          create: items.map((item: any) => ({
            ...item,
            amount: Number(item.amount),
          })),
        },
      },
    });
  }

  async getMyExpenses(userId: number, query: { page?: number; limit?: number }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    const employeeId = await this.resolveEmployeeId(user);
    if (!employeeId) return { data: [], total: 0 };

    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    const [data, total] = await Promise.all([
      this.prisma.expense.findMany({
        where: { employee_id: employeeId },
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.expense.count({ where: { employee_id: employeeId } }),
    ]);
    return { data, total, page, limit };
  }

  // ── Payrolls (糧單) ────────────────────────────────────────────
  async getMyPayrolls(userId: number, query: { page?: number; limit?: number }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    const employeeId = await this.resolveEmployeeId(user);
    if (!employeeId) return { data: [], total: 0 };

    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    const [data, total] = await Promise.all([
      this.prisma.payroll.findMany({
        where: { employee_id: employeeId, status: { in: ['finalized', 'paid'] } },
        orderBy: { date_to: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.payroll.count({ where: { employee_id: employeeId, status: { in: ['finalized', 'paid'] } } }),
    ]);
    return { data, total, page, limit };
  }

  // ── Dashboard ──────────────────────────────────────────────────
  async getDashboard(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    const employeeId = await this.resolveEmployeeId(user);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [todayAttendance, monthWorkLogs, pendingExpenses, pendingLeaves] = await Promise.all([
      employeeId ? this.prisma.employeeAttendance.findMany({
        where: { employee_id: employeeId, timestamp: { gte: today, lt: tomorrow } },
      }) : Promise.resolve([]),
      employeeId ? this.prisma.workLog.count({
        where: { employee_id: employeeId, scheduled_date: { gte: monthStart } },
      }) : Promise.resolve(0),
      employeeId ? this.prisma.expense.count({
        where: { employee_id: employeeId, is_paid: false },
      }) : Promise.resolve(0),
      employeeId ? this.prisma.employeeLeave.count({
        where: { employee_id: employeeId, status: 'pending' },
      }) : Promise.resolve(0),
    ]);

    return { todayAttendance, monthWorkLogs, pendingExpenses, pendingLeaves, employeeId };
  }

  // ── Certificates (證件) ────────────────────────────────────────
  async getCertificates(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    const employeeId = await this.resolveEmployeeId(user);
    if (!employeeId) return null;

    return this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        id: true,
        driving_license_no: true, driving_license_expiry: true,
        green_card_no: true, green_card_expiry: true,
        construction_card_no: true, construction_card_expiry: true,
        approved_worker_cert_no: true, approved_worker_cert_expiry: true,
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
        other_certificates: true,
        cert_photos: true,
      },
    });
  }

  async updateCertPhoto(userId: number, certKey: string, photoUrl: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    const employeeId = await this.resolveEmployeeId(user);
    if (!employeeId) throw new BadRequestException('找不到對應的員工記錄');

    const emp = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    const certPhotos = (emp?.cert_photos as any) || {};
    certPhotos[certKey] = photoUrl;

    return this.prisma.employee.update({
      where: { id: employeeId },
      data: { cert_photos: certPhotos },
    });
  }

  async getExpiringCerts(userId: number, days: number = 90) {
    const emp = await this.getCertificates(userId);
    if (!emp) return { expiring: [] };

    const expiring: any[] = [];
    const now = new Date();
    const limit = new Date();
    limit.setDate(limit.getDate() + days);

    const check = (key: string, name_zh: string, name_en: string, expiry: any) => {
      if (!expiry) return;
      const d = new Date(expiry);
      if (d <= limit) {
        expiring.push({
          key, name_zh, name_en,
          expiry_date: expiry,
          days_left: Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
          is_expired: d < now,
        });
      }
    };

    check('driving_license', '駕駛執照', 'Driving License', emp.driving_license_expiry);
    check('green_card', '平安卡', 'Green Card', emp.green_card_expiry);
    check('construction_card', '工卡', 'Construction Card', emp.construction_card_expiry);
    check('approved_worker', '核准工人證明書', 'Approved Worker Cert', emp.approved_worker_cert_expiry);
    check('earth_mover', '操作搬土機證明書', 'Earth Mover Cert', emp.earth_mover_cert_expiry);
    check('excavator', '操作挖掘機證明書', 'Excavator Cert', emp.excavator_cert_expiry);
    check('crane_operator', '起重機操作員證明書', 'Crane Operator Cert', emp.crane_operator_cert_expiry);
    check('lorry_crane', '操作貨車吊機證明書', 'Lorry Crane Cert', emp.lorry_crane_cert_expiry);
    check('crawler_crane', '操作履帶式固定吊臂起重機證明書', 'Crawler Crane Cert', emp.crawler_crane_cert_expiry);
    check('hydraulic_crane', '操作輪胎式液壓伸縮吊臂起重機證明書', 'Hydraulic Crane Cert', emp.hydraulic_crane_cert_expiry);
    check('airport_pass', '機場禁區通行證', 'Airport Pass', emp.airport_pass_expiry);
    check('gammon_pass', '金門證', 'Gammon Pass', emp.gammon_pass_expiry);
    check('leighton_pass', '禮頓證', 'Leighton Pass', emp.leighton_pass_expiry);
    check('confined_space', '密閉空間作業核准工人證明書', 'Confined Space Cert', emp.confined_space_cert_expiry);
    check('compactor', '操作壓實機證明書', 'Compactor Cert', emp.compactor_cert_expiry);
    check('slinging_silver', '吊索銀咭', 'Slinging Silver Card', emp.slinging_silver_card_expiry);
    check('craft_test', '工藝測試證明書', 'Craft Test Cert', emp.craft_test_cert_expiry);
    check('compaction_load', '壓實負荷物移動機械操作員機證明書', 'Compaction Load Cert', emp.compaction_load_cert_expiry);
    check('aerial_platform', '升降台安全使用訓練證書', 'Aerial Platform Cert', emp.aerial_platform_cert_expiry);

    // Check other_certificates
    const other = (emp.other_certificates as any) || {};
    for (const label in other) {
      const cert = other[label];
      if (cert.expiry_date) {
        const d = new Date(cert.expiry_date);
        if (d <= limit) {
          expiring.push({
            key: `other_${label}`, name_zh: label, name_en: label,
            expiry_date: cert.expiry_date,
            days_left: Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
            is_expired: d < now,
          });
        }
      }
    }

    return { expiring: expiring.sort((a, b) => a.days_left - b.days_left) };
  }

  // ── Admin: Create employee user account ─────────────────────────────
  async createEmployeeUser(data: { phone: string; displayName: string; employee_id?: number }) {
    // If an employee_id is provided, verify the employee is active (not terminated).
    if (data.employee_id) {
      const employee = await this.prisma.employee.findUnique({
        where: { id: data.employee_id },
      });
      if (!employee) throw new BadRequestException('找不到對應的員工記錄');
      if (employee.status !== 'active') {
        throw new BadRequestException('無法為離職員工建立帳號');
      }
    }

    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ username: `emp_${data.phone}` }, { phone: data.phone }] },
    });
    if (existing) throw new BadRequestException('該電話號碼已有關聯帳號');

    const defaultPassword = `Aa-${data.phone}`;
    const hashed = await bcrypt.hash(defaultPassword, 10);

    return this.prisma.user.create({
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
  }

  // ── Admin: Bulk create accounts for all employees with phone numbers ────────
  async bulkCreateEmployeeAccounts() {
    const employees = await this.prisma.employee.findMany({
      where: { phone: { not: null }, status: 'active' },
    });

    const results = { created: [] as any[], skipped: [] as any[], errors: [] as any[] };

    for (const emp of employees) {
      if (!emp.phone || !/^\d{8,}$/.test(emp.phone)) {
        results.skipped.push({ employee_id: emp.id, phone: emp.phone, reason: 'Invalid phone format' });
        continue;
      }

      const existing = await this.prisma.user.findFirst({
        where: { OR: [{ username: `emp_${emp.phone}` }, { phone: emp.phone }, { employee_id: emp.id }] },
      });

      if (existing) {
        results.skipped.push({ employee_id: emp.id, phone: emp.phone, reason: 'User already exists' });
        continue;
      }

      try {
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

  // ── Mid-Shift Approvals (中直批核) ─────────────────────────────
  async getPendingMidShiftApprovals(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    
    if (!(user as any).can_approve_mid_shift) {
      throw new UnauthorizedException('您沒有權限進行中直批核');
    }

    const employeeId = await this.resolveEmployeeId(user);

    const pending = await this.prisma.employeeAttendance.findMany({
      where: {
        is_mid_shift: true,
        mid_shift_approved: false,
      },
      include: {
        employee: {
          select: { id: true, name_zh: true, name_en: true, emp_code: true }
        }
      },
      orderBy: { timestamp: 'desc' },
    });

    return pending;
  }

  async approveMidShift(userId: number, data: { attendance_ids: number[], signature_base64: string }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    
    if (!(user as any).can_approve_mid_shift) {
      throw new UnauthorizedException('您沒有權限進行中直批核');
    }

    const approverEmployeeId = await this.resolveEmployeeId(user);
    if (!approverEmployeeId) throw new BadRequestException('找不到對應的員工記錄');

    if (!data.attendance_ids || data.attendance_ids.length === 0) {
      throw new BadRequestException('請選擇要批核的記錄');
    }

    await this.prisma.employeeAttendance.updateMany({
      where: {
        id: { in: data.attendance_ids },
        is_mid_shift: true,
        mid_shift_approved: false,
      },
      data: {
        mid_shift_approved: true,
        mid_shift_approved_by: approverEmployeeId,
        mid_shift_approved_at: new Date(),
        mid_shift_approval_signature: data.signature_base64,
      },
    });

    return { success: true, count: data.attendance_ids.length };
  }

  async getMidShiftApprovalHistory(userId: number, query: { page?: number; limit?: number }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    
    const approverEmployeeId = await this.resolveEmployeeId(user);
    if (!approverEmployeeId) throw new BadRequestException('找不到對應的員工記錄');

    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    const [data, total] = await Promise.all([
      this.prisma.employeeAttendance.findMany({
        where: {
          mid_shift_approved: true,
          mid_shift_approved_by: approverEmployeeId,
        },
        include: {
          employee: {
            select: { id: true, name_zh: true, name_en: true, emp_code: true }
          }
        },
        orderBy: { mid_shift_approved_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.employeeAttendance.count({
        where: {
          mid_shift_approved: true,
          mid_shift_approved_by: approverEmployeeId,
        },
      }),
    ]);

    return { data, total, page, limit };
  }

  // ── Daily Reports (工程日報) ─────────────────────────────────────
  async getMyDailyReports(userId: number, query: any) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    if (!(user as any).can_daily_report) throw new UnauthorizedException('您沒有權限填寫工程日報');
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const where: any = { daily_report_created_by: userId };
    if (query.project_id) where.daily_report_project_id = Number(query.project_id);
    if (query.date_from || query.date_to) {
      where.daily_report_date = {};
      if (query.date_from) where.daily_report_date.gte = new Date(query.date_from);
      if (query.date_to) where.daily_report_date.lte = new Date(query.date_to);
    }
    const [data, total] = await Promise.all([
      this.prisma.dailyReport.findMany({ where, include: { project: { select: { id: true, project_no: true, project_name: true } }, items: { orderBy: { daily_report_item_sort_order: 'asc' } } }, orderBy: { daily_report_date: 'desc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.dailyReport.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  async getDailyReport(userId: number, id: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    if (!(user as any).can_daily_report) throw new UnauthorizedException('您沒有權限填寫工程日報');
    const report = await this.prisma.dailyReport.findUnique({ where: { id }, include: { project: { select: { id: true, project_no: true, project_name: true, address: true, client: { select: { id: true, name: true } }, contract: { select: { id: true, contract_no: true } } } }, items: { orderBy: { daily_report_item_sort_order: 'asc' } } } });
    if (!report) throw new BadRequestException('日報不存在');
    return report;
  }

  async createDailyReport(userId: number, dto: any) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    if (!(user as any).can_daily_report) throw new UnauthorizedException('您沒有權限填寫工程日報');
    const { items, ...rd } = dto;
    return this.prisma.dailyReport.create({ data: { daily_report_project_id: Number(rd.project_id), daily_report_date: new Date(rd.report_date), daily_report_shift_type: rd.shift_type, daily_report_work_summary: rd.work_summary, daily_report_memo: rd.memo || null, daily_report_created_by: userId, daily_report_status: rd.status || 'draft', daily_report_submitted_at: rd.status === 'submitted' ? new Date() : null, items: items?.length ? { create: items.map((i: any, idx: number) => ({ daily_report_item_category: i.category, daily_report_item_content: i.content, daily_report_item_quantity: i.quantity ? Number(i.quantity) : null, daily_report_item_ot_hours: i.ot_hours ? Number(i.ot_hours) : null, daily_report_item_name_or_plate: i.name_or_plate || null, daily_report_item_sort_order: idx })) } : undefined }, include: { project: { select: { id: true, project_no: true, project_name: true } }, items: { orderBy: { daily_report_item_sort_order: 'asc' } } } });
  }

  async updateDailyReport(userId: number, id: number, dto: any) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    if (!(user as any).can_daily_report) throw new UnauthorizedException('您沒有權限填寫工程日報');
    const existing = await this.prisma.dailyReport.findUnique({ where: { id } });
    if (!existing) throw new BadRequestException('日報不存在');
    if (existing.daily_report_status === 'submitted') throw new BadRequestException('已提交的日報不可修改');
    if (existing.daily_report_created_by !== userId) throw new BadRequestException('只能修改自己建立的日報');
    const { items, ...rd } = dto;
    await this.prisma.dailyReportItem.deleteMany({ where: { daily_report_item_report_id: id } });
    return this.prisma.dailyReport.update({ where: { id }, data: { daily_report_project_id: Number(rd.project_id), daily_report_date: new Date(rd.report_date), daily_report_shift_type: rd.shift_type, daily_report_work_summary: rd.work_summary, daily_report_memo: rd.memo || null, daily_report_status: rd.status || 'draft', daily_report_submitted_at: rd.status === 'submitted' ? new Date() : null, items: items?.length ? { create: items.map((i: any, idx: number) => ({ daily_report_item_category: i.category, daily_report_item_content: i.content, daily_report_item_quantity: i.quantity ? Number(i.quantity) : null, daily_report_item_ot_hours: i.ot_hours ? Number(i.ot_hours) : null, daily_report_item_name_or_plate: i.name_or_plate || null, daily_report_item_sort_order: idx })) } : undefined }, include: { project: { select: { id: true, project_no: true, project_name: true } }, items: { orderBy: { daily_report_item_sort_order: 'asc' } } } });
  }

  async deleteDailyReport(userId: number, id: number) {
    const existing = await this.prisma.dailyReport.findUnique({ where: { id } });
    if (!existing) throw new BadRequestException('日報不存在');
    if (existing.daily_report_status === 'submitted') throw new BadRequestException('已提交的日報不可刪除');
    if (existing.daily_report_created_by !== userId) throw new BadRequestException('只能刪除自己建立的日報');
    await this.prisma.dailyReport.delete({ where: { id } });
    return { success: true };
  }

  // ── Acceptance Reports (工程收貨報告) ──────────────────────────────
  async getMyAcceptanceReports(userId: number, query: any) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    if (!(user as any).can_acceptance_report) throw new UnauthorizedException('您沒有權限填寫工程收貨報告');
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const where: any = { acceptance_report_created_by: userId };
    if (query.project_id) where.acceptance_report_project_id = Number(query.project_id);
    if (query.date_from || query.date_to) {
      where.acceptance_report_date = {};
      if (query.date_from) where.acceptance_report_date.gte = new Date(query.date_from);
      if (query.date_to) where.acceptance_report_date.lte = new Date(query.date_to);
    }
    const [data, total] = await Promise.all([
      this.prisma.acceptanceReport.findMany({ where, include: { project: { select: { id: true, project_no: true, project_name: true } }, attachments: { orderBy: { acceptance_report_attachment_sort_order: 'asc' } } }, orderBy: { acceptance_report_date: 'desc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.acceptanceReport.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  async getAcceptanceReport(userId: number, id: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    if (!(user as any).can_acceptance_report) throw new UnauthorizedException('您沒有權限填寫工程收貨報告');
    const report = await this.prisma.acceptanceReport.findUnique({ where: { id }, include: { project: { select: { id: true, project_no: true, project_name: true, address: true, client: { select: { id: true, name: true } }, contract: { select: { id: true, contract_no: true } } } }, inspector: { select: { id: true, name_zh: true, name_en: true } }, attachments: { orderBy: { acceptance_report_attachment_sort_order: 'asc' } } } });
    if (!report) throw new BadRequestException('收貨報告不存在');
    return report;
  }

  async createAcceptanceReport(userId: number, dto: any) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    if (!(user as any).can_acceptance_report) throw new UnauthorizedException('您沒有權限填寫工程收貨報告');
    const employeeId = await this.resolveEmployeeId(user);
    if (!employeeId) throw new BadRequestException('找不到對應的員工記錄');
    const { attachments, ...rd } = dto;
    return this.prisma.acceptanceReport.create({ data: { acceptance_report_date: new Date(rd.report_date), acceptance_report_acceptance_date: new Date(rd.acceptance_date), acceptance_report_client_id: rd.client_id ? Number(rd.client_id) : null, acceptance_report_client_name: rd.client_name, acceptance_report_project_id: rd.project_id ? Number(rd.project_id) : null, acceptance_report_project_name: rd.project_name, acceptance_report_contract_ref: rd.contract_ref || null, acceptance_report_site_address: rd.site_address, acceptance_report_items: rd.acceptance_items, acceptance_report_quantity_unit: rd.quantity_unit || null, acceptance_report_mingtat_inspector_id: rd.mingtat_inspector_id ? Number(rd.mingtat_inspector_id) : employeeId, acceptance_report_mingtat_inspector_title: rd.mingtat_inspector_title, acceptance_report_client_inspector_name: rd.client_inspector_name, acceptance_report_client_inspector_title: rd.client_inspector_title, acceptance_report_client_signature: rd.client_signature || null, acceptance_report_mingtat_signature: rd.mingtat_signature || null, acceptance_report_supplementary_notes: rd.supplementary_notes || null, acceptance_report_created_by: userId, acceptance_report_status: rd.status || 'draft', acceptance_report_submitted_at: rd.status === 'submitted' ? new Date() : null, attachments: attachments?.length ? { create: attachments.map((a: any, idx: number) => ({ acceptance_report_attachment_file_name: a.file_name, acceptance_report_attachment_file_url: a.file_url, acceptance_report_attachment_file_type: a.file_type, acceptance_report_attachment_sort_order: idx })) } : undefined }, include: { project: { select: { id: true, project_no: true, project_name: true } }, attachments: { orderBy: { acceptance_report_attachment_sort_order: 'asc' } } } });
  }

  async updateAcceptanceReport(userId: number, id: number, dto: any) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    if (!(user as any).can_acceptance_report) throw new UnauthorizedException('您沒有權限填寫工程收貨報告');
    const existing = await this.prisma.acceptanceReport.findUnique({ where: { id } });
    if (!existing) throw new BadRequestException('收貨報告不存在');
    if (existing.acceptance_report_status === 'submitted') throw new BadRequestException('已提交的收貨報告不可修改');
    if (existing.acceptance_report_created_by !== userId) throw new BadRequestException('只能修改自己建立的收貨報告');
    const { attachments, ...rd } = dto;
    await this.prisma.acceptanceReportAttachment.deleteMany({ where: { acceptance_report_attachment_report_id: id } });
    return this.prisma.acceptanceReport.update({ where: { id }, data: { acceptance_report_date: new Date(rd.report_date), acceptance_report_acceptance_date: new Date(rd.acceptance_date), acceptance_report_client_id: rd.client_id ? Number(rd.client_id) : null, acceptance_report_client_name: rd.client_name, acceptance_report_project_id: rd.project_id ? Number(rd.project_id) : null, acceptance_report_project_name: rd.project_name, acceptance_report_contract_ref: rd.contract_ref || null, acceptance_report_site_address: rd.site_address, acceptance_report_items: rd.acceptance_items, acceptance_report_quantity_unit: rd.quantity_unit || null, acceptance_report_mingtat_inspector_id: Number(rd.mingtat_inspector_id), acceptance_report_mingtat_inspector_title: rd.mingtat_inspector_title, acceptance_report_client_inspector_name: rd.client_inspector_name, acceptance_report_client_inspector_title: rd.client_inspector_title, acceptance_report_client_signature: rd.client_signature || null, acceptance_report_mingtat_signature: rd.mingtat_signature || null, acceptance_report_supplementary_notes: rd.supplementary_notes || null, acceptance_report_status: rd.status || 'draft', acceptance_report_submitted_at: rd.status === 'submitted' ? new Date() : null, attachments: attachments?.length ? { create: attachments.map((a: any, idx: number) => ({ acceptance_report_attachment_file_name: a.file_name, acceptance_report_attachment_file_url: a.file_url, acceptance_report_attachment_file_type: a.file_type, acceptance_report_attachment_sort_order: idx })) } : undefined }, include: { project: { select: { id: true, project_no: true, project_name: true } }, attachments: { orderBy: { acceptance_report_attachment_sort_order: 'asc' } } } });
  }

  async deleteAcceptanceReport(userId: number, id: number) {
    const existing = await this.prisma.acceptanceReport.findUnique({ where: { id } });
    if (!existing) throw new BadRequestException('收貨報告不存在');
    if (existing.acceptance_report_status === 'submitted') throw new BadRequestException('已提交的收貨報告不可刪除');
    if (existing.acceptance_report_created_by !== userId) throw new BadRequestException('只能刪除自己建立的收貨報告');
    await this.prisma.acceptanceReport.delete({ where: { id } });
    return { success: true };
  }
}
