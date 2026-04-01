import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async login(username: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { username } });
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
      },
    };
  }

  async getProfile(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
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
    };
  }

  async seedAdmin() {
    const exists = await this.prisma.user.findUnique({ where: { username: 'admin' } });
    if (!exists) {
      const hashed = await bcrypt.hash('admin123', 10);
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
      console.log('Admin user seeded: admin / admin123');
    } else {
      // Ensure existing admin has admin role
      if (exists.role !== 'admin') {
        await this.prisma.user.update({
          where: { id: exists.id },
          data: { role: 'admin' },
        });
        console.log('Existing admin user upgraded to admin role');
      }
    }
  }
}
