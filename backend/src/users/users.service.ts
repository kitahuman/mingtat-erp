import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: { role?: string; department?: string; isActive?: string; search?: string }) {
    const where: any = {};

    if (query.role) where.role = query.role;
    if (query.department) where.department = query.department;
    if (query.isActive !== undefined && query.isActive !== '') {
      where.isActive = query.isActive === 'true';
    }
    if (query.search) {
      where.OR = [
        { username: { contains: query.search, mode: 'insensitive' } },
        { displayName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const users = await this.prisma.user.findMany({
      where,
      include: {
        employee: { select: { id: true, name_zh: true, name_en: true, emp_code: true, role: true } },
      },
    });

    // Sort by role priority first, then alphabetically by English name.
    // Priority: admin/superadmin (0) > manager (1) > clerk (2) > driver/worker (3) > others (4)
    const ROLE_PRIORITY: Record<string, number> = {
      superadmin: 0,
      admin: 0,
      manager: 1,
      clerk: 2,
      driver: 3,
      worker: 3,
    };

    const getRolePriority = (role: string): number =>
      ROLE_PRIORITY[role] !== undefined ? ROLE_PRIORITY[role] : 4;

    // Resolve the best English name for sorting:
    // prefer the linked employee's name_en, fall back to displayName.
    const getSortName = (u: any): string =>
      (u.employee?.name_en || u.displayName || '').toLowerCase();

    users.sort((a, b) => {
      const roleDiff = getRolePriority(a.role) - getRolePriority(b.role);
      if (roleDiff !== 0) return roleDiff;
      return getSortName(a).localeCompare(getSortName(b), 'en', { sensitivity: 'base' });
    });

    return users.map(u => this.sanitizeUser(u));
  }

  async findOne(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        employee: { select: { id: true, name_zh: true, name_en: true, emp_code: true, role: true, company_id: true } },
      },
    });
    if (!user) throw new NotFoundException('用戶不存在');
    return this.sanitizeUser(user);
  }

  async create(dto: CreateUserDto, createdById: number) {
    const existing = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (existing) {
      throw new ConflictException('用戶名已存在');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const saved = await this.prisma.user.create({
      data: {
        username: dto.username,
        password: hashedPassword,
        displayName: dto.displayName,
        role: dto.role,
        email: dto.email ?? null,
        phone: dto.phone ?? null,
        department: dto.department ?? null,
        isActive: dto.isActive !== undefined ? dto.isActive : true,
        user_can_company_clock: dto.user_can_company_clock ?? false,
        can_approve_mid_shift: dto.can_approve_mid_shift ?? false,
        can_daily_report: dto.can_daily_report ?? false,
        can_acceptance_report: dto.can_acceptance_report ?? false,
        createdBy: createdById,
      },
    });
    return this.sanitizeUser(saved);
  }

  async update(id: number, dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('用戶不存在');

    const data: any = {};
    if (dto.password) {
      data.password = await bcrypt.hash(dto.password, 10);
    }
    if (dto.displayName !== undefined) data.displayName = dto.displayName;
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.email !== undefined) data.email = dto.email ?? null;
    if (dto.phone !== undefined) data.phone = dto.phone ?? null;
    if (dto.department !== undefined) data.department = dto.department ?? null;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.employee_id !== undefined) data.employee_id = dto.employee_id;
    if (dto.user_can_company_clock !== undefined) data.user_can_company_clock = dto.user_can_company_clock;
    if (dto.can_approve_mid_shift !== undefined) data.can_approve_mid_shift = dto.can_approve_mid_shift;
    if (dto.can_daily_report !== undefined) data.can_daily_report = dto.can_daily_report;
    if (dto.can_acceptance_report !== undefined) data.can_acceptance_report = dto.can_acceptance_report;
    if (dto.page_permissions !== undefined) data.page_permissions = dto.page_permissions;

    const saved = await this.prisma.user.update({
      where: { id },
      data,
      include: {
        employee: { select: { id: true, name_zh: true, name_en: true, emp_code: true, role: true, company_id: true } },
      },
    });
    return this.sanitizeUser(saved);
  }

  async toggleActive(id: number) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('用戶不存在');

    const saved = await this.prisma.user.update({
      where: { id },
      data: { isActive: !user.isActive },
    });
    return this.sanitizeUser(saved);
  }

  private sanitizeUser(user: any) {
    const { password, ...result } = user;
    return result;
  }
}
