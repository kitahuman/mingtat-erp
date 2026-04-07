import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { FaceRecognitionService } from './face-recognition.service';

@Injectable()
export class CompanyClockService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private faceRecognitionService: FaceRecognitionService,
  ) {}

  // ── Login (same as employee-portal login, reused logic) ──────────
  async login(identifier: string, password: string) {
    let user: any = null;

    // Try username lookup first
    try {
      user = await this.prisma.user.findFirst({
        where: { username: identifier, isActive: true },
      });
    } catch {
      // ignore
    }

    // Try phone lookup
    if (!user) {
      try {
        user = await this.prisma.user.findFirst({
          where: { phone: identifier, isActive: true } as any,
        });
      } catch {
        // ignore
      }
    }

    if (!user) {
      throw new UnauthorizedException('帳號或密碼錯誤');
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      throw new UnauthorizedException('帳號或密碼錯誤');
    }

    // Check company clock permission (admin always allowed)
    if (user.role !== 'admin' && !user.user_can_company_clock) {
      throw new UnauthorizedException('此帳號沒有公司打卡權限，請聯繫管理員開通');
    }

    // Update last login
    try {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
    } catch {
      // ignore
    }

    const payload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      portal: 'company_clock',
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
      },
    };
  }

  // ── Get employee list for clock-in ──────────────────────────────
  async getEmployeeList(query: {
    search?: string;
    company_id?: number;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 50;
    const where: any = {};

    // Default to active employees
    where.status = query.status || 'active';

    if (query.company_id) {
      where.company_id = Number(query.company_id);
    }

    if (query.search) {
      where.OR = [
        { name_zh: { contains: query.search, mode: 'insensitive' } },
        { name_en: { contains: query.search, mode: 'insensitive' } },
        { emp_code: { contains: query.search, mode: 'insensitive' } },
        { nickname: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const total = await this.prisma.employee.count({ where });

    // Get recently clocked employees (last 30 unique employees who used company clock)
    const recentAttendances = await this.prisma.employeeAttendance.findMany({
      where: {
        attendance_operator_user_id: { not: null }, // Only company clock records
      },
      select: { employee_id: true, timestamp: true },
      orderBy: { timestamp: 'desc' },
      take: 200, // Fetch more to find 30 unique
    });

    const recentEmployeeIds: number[] = [];
    const seen = new Set<number>();
    for (const att of recentAttendances) {
      if (!seen.has(att.employee_id)) {
        seen.add(att.employee_id);
        recentEmployeeIds.push(att.employee_id);
        if (recentEmployeeIds.length >= 30) break;
      }
    }

    // Fetch all employees (no pagination for sorting, then paginate manually)
    const allData = await this.prisma.employee.findMany({
      where,
      select: {
        id: true,
        emp_code: true,
        name_zh: true,
        name_en: true,
        nickname: true,
        role: true,
        phone: true,
        company_id: true,
        employee_photo_base64: true,
        employee_is_temporary: true,
        status: true,
        company: {
          select: { id: true, name: true, internal_prefix: true },
        },
      },
      orderBy: { name_en: 'asc' },
    });

    // Sort: recent 30 first (in recency order), then rest by name_en
    const recentSet = new Set(recentEmployeeIds);
    const recentEmps: any[] = [];
    const otherEmps: any[] = [];
    for (const emp of allData) {
      if (recentSet.has(emp.id)) {
        recentEmps.push(emp);
      } else {
        otherEmps.push(emp);
      }
    }
    // Sort recent employees by their recency order
    recentEmps.sort((a, b) => recentEmployeeIds.indexOf(a.id) - recentEmployeeIds.indexOf(b.id));
    const sorted = [...recentEmps, ...otherEmps];

    // Paginate
    const paginated = sorted.slice((page - 1) * limit, page * limit);

    // Map to include hasStandardPhoto flag (don't send full base64 in list)
    const employees = paginated.map((emp: any) => ({
      ...emp,
      hasStandardPhoto: !!emp.employee_photo_base64,
      employee_photo_base64: undefined, // Don't include full base64 in list
    }));

    return { data: employees, total, page, limit };
  }

  // ── Get companies for filter dropdown ───────────────────────────
  async getCompanies() {
    return this.prisma.company.findMany({
      where: { status: 'active' },
      select: { id: true, name: true, internal_prefix: true },
      orderBy: { name: 'asc' },
    });
  }

  // ── Get employee standard photo ─────────────────────────────────
  async getEmployeePhoto(employeeId: number) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, name_zh: true, name_en: true, employee_photo_base64: true },
    });
    if (!employee) throw new NotFoundException('找不到員工');
    return {
      id: employee.id,
      name_zh: employee.name_zh,
      name_en: employee.name_en,
      hasPhoto: !!employee.employee_photo_base64,
      photo_base64: employee.employee_photo_base64,
    };
  }

  // ── Upload/Update employee standard photo ───────────────────────
  async updateEmployeePhoto(employeeId: number, photoBase64: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
    });
    if (!employee) throw new NotFoundException('找不到員工');

    await this.prisma.employee.update({
      where: { id: employeeId },
      data: { employee_photo_base64: photoBase64 },
    });

    return { success: true, message: '標準照已更新' };
  }

  // ── Company Clock-In with Face Recognition ──────────────────────
  async clockIn(data: {
    employee_id: number;
    photo_base64: string;
    type: 'clock_in' | 'clock_out';
    operator_user_id: number;
    latitude?: number;
    longitude?: number;
    address?: string;
    remarks?: string;
  }) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: data.employee_id },
      select: {
        id: true,
        name_zh: true,
        name_en: true,
        employee_photo_base64: true,
      },
    });

    if (!employee) {
      throw new NotFoundException('找不到員工');
    }

    let verificationMethod: string;
    let verificationScore: number | null = null;

    // AI face recognition is currently disabled to save resources.
    // Photos are still saved as attendance proof.
    // To re-enable, uncomment the face_ai block below.

    if (!employee.employee_photo_base64) {
      // No standard photo → first time, save as standard photo
      await this.prisma.employee.update({
        where: { id: data.employee_id },
        data: { employee_photo_base64: data.photo_base64 },
      });
      verificationMethod = 'first_time';
    } else {
      // Skip AI comparison, mark as manual verification
      verificationMethod = 'manual';
    }

    /* --- AI Face Recognition (disabled) ---
    if (employee.employee_photo_base64) {
      const result = await this.faceRecognitionService.compareFaces(
        employee.employee_photo_base64,
        data.photo_base64,
      );
      verificationScore = result.similarityScore;
      if (!result.isSamePerson) {
        throw new BadRequestException(
          `人臉驗證未通過（相似度: ${result.similarityScore}%）。${result.explanation}`,
        );
      }
      verificationMethod = 'face_ai';
    } else {
      await this.prisma.employee.update({
        where: { id: data.employee_id },
        data: { employee_photo_base64: data.photo_base64 },
      });
      verificationMethod = 'first_time';
    }
    --- */

    // Create attendance record
    const attendance = await this.prisma.employeeAttendance.create({
      data: {
        employee_id: data.employee_id,
        type: data.type,
        timestamp: new Date(),
        attendance_photo_base64: data.photo_base64,
        attendance_verification_method: verificationMethod,
        attendance_verification_score: verificationScore,
        attendance_operator_user_id: data.operator_user_id,
        latitude: data.latitude,
        longitude: data.longitude,
        address: data.address,
        remarks: data.remarks,
      },
    });

    return {
      success: true,
      attendance,
      verification: {
        method: verificationMethod,
        score: verificationScore,
        isFirstTime: verificationMethod === 'first_time',
      },
      employee: {
        id: employee.id,
        name_zh: employee.name_zh,
        name_en: employee.name_en,
      },
    };
  }

  // ── Create Temporary Employee ───────────────────────────────────
  async createTemporaryEmployee(data: {
    name_zh: string;
    name_en?: string;
    phone?: string;
    photo_base64: string;
    company_id: number;
    operator_user_id: number;
  }) {
    // Create the temporary employee
    const employee = await this.prisma.employee.create({
      data: {
        name_zh: data.name_zh,
        name_en: data.name_en || '',
        phone: data.phone,
        company_id: data.company_id,
        employee_photo_base64: data.photo_base64,
        employee_is_temporary: true,
        role: 'worker',
        status: 'active',
      },
    });

    // Auto clock-in for the new temporary employee
    const attendance = await this.prisma.employeeAttendance.create({
      data: {
        employee_id: employee.id,
        type: 'clock_in',
        timestamp: new Date(),
        attendance_photo_base64: data.photo_base64,
        attendance_verification_method: 'first_time',
        attendance_operator_user_id: data.operator_user_id,
      },
    });

    return {
      success: true,
      employee: {
        id: employee.id,
        name_zh: employee.name_zh,
        name_en: employee.name_en,
        employee_is_temporary: employee.employee_is_temporary,
      },
      attendance,
      message: `臨時員工「${data.name_zh}」已建立並完成打卡`,
    };
  }

  // ── Get today's attendance records (for operator view) ──────────
  async getTodayAttendances(query: { company_id?: number; search?: string }) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const where: any = {
      timestamp: { gte: today, lt: tomorrow },
    };

    if (query.company_id || query.search) {
      where.employee = {};
      if (query.company_id) {
        where.employee.company_id = Number(query.company_id);
      }
      if (query.search) {
        where.employee.OR = [
          { name_zh: { contains: query.search, mode: 'insensitive' } },
          { name_en: { contains: query.search, mode: 'insensitive' } },
        ];
      }
    }

    const records = await this.prisma.employeeAttendance.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            name_zh: true,
            name_en: true,
            emp_code: true,
            company: { select: { name: true, internal_prefix: true } },
          },
        },
      },
      orderBy: { timestamp: 'desc' },
    });

    return { records, total: records.length };
  }
}
