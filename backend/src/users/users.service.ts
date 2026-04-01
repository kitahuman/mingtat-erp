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
      orderBy: { createdAt: 'desc' },
    });
    return users.map(u => this.sanitizeUser(u));
  }

  async findOne(id: number) {
    const user = await this.prisma.user.findUnique({ where: { id } });
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

    const saved = await this.prisma.user.update({ where: { id }, data });
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
