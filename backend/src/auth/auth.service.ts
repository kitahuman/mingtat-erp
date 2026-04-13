import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { computeEffectivePages, ALL_PAGES } from './page-permissions';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async login(username: string, password: string) {
    // 先用 username 查找，找不到再用 phone 查找
    let user = await this.prisma.user.findUnique({ where: { username } });
    if (!user) {
      user = await this.prisma.user.findFirst({ where: { phone: username } });
    }
    if (!user || !user.isActive) {
      throw new UnauthorizedException('帳號或密碼錯誤');
    }
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      throw new UnauthorizedException('帳號或密碼錯誤');
    }

    // Update last login time
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const allowedPages = computeEffectivePages(
      user.role,
      user.page_permissions as any,
    );

    const payload = { sub: user.id, username: user.username, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        email: user.email,
        phone: user.phone,
        department: user.department,
        isActive: user.isActive,
        allowedPages,
      },
    };
  }

  async getProfile(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    const allowedPages = computeEffectivePages(
      user.role,
      user.page_permissions as any,
    );

    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      email: user.email,
      phone: user.phone,
      department: user.department,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      allowedPages,
    };
  }

  /**
   * Get all page definitions (for admin UI)
   */
  getAllPages() {
    return ALL_PAGES;
  }

  async seedAdmin() {
    const exists = await this.prisma.user.findUnique({ where: { username: 'admin' } });
    if (!exists) {
      const initialPassword = process.env.ADMIN_INITIAL_PASSWORD;
      if (!initialPassword) {
        console.error('[FATAL] ADMIN_INITIAL_PASSWORD environment variable is not set. Cannot seed admin user.');
        process.exit(1);
      }
      const hashed = await bcrypt.hash(initialPassword, 10);
      await this.prisma.user.create({
        data: {
          username: 'admin',
          password: hashed,
          displayName: '系統管理員',
          role: 'admin',
          department: '辦公室',
          isActive: true,
        },
      });
      console.log('[INFO] Admin user seeded successfully.');
    } else {
      // Ensure existing admin has admin role
      if (exists.role !== 'admin') {
        await this.prisma.user.update({
          where: { id: exists.id },
          data: { role: 'admin' },
        });
        console.log('[INFO] Existing admin user upgraded to admin role.');
      }
    }
  }
}
