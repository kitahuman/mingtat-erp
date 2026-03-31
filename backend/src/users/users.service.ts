import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../auth/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
  ) {}

  async findAll(query: { role?: string; department?: string; isActive?: string; search?: string }) {
    const qb = this.userRepo.createQueryBuilder('user');

    if (query.role) {
      qb.andWhere('user.role = :role', { role: query.role });
    }
    if (query.department) {
      qb.andWhere('user.department = :department', { department: query.department });
    }
    if (query.isActive !== undefined && query.isActive !== '') {
      qb.andWhere('user.isActive = :isActive', { isActive: query.isActive === 'true' });
    }
    if (query.search) {
      qb.andWhere(
        '(user.username ILIKE :search OR user.displayName ILIKE :search OR user.email ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    qb.orderBy('user.createdAt', 'DESC');

    const users = await qb.getMany();
    return users.map(u => this.sanitizeUser(u));
  }

  async findOne(id: number) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('用戶不存在');
    return this.sanitizeUser(user);
  }

  async create(dto: CreateUserDto, createdById: number) {
    const existing = await this.userRepo.findOne({ where: { username: dto.username } });
    if (existing) {
      throw new ConflictException('用戶名已存在');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const user = new User();
    user.username = dto.username;
    user.password = hashedPassword;
    user.displayName = dto.displayName;
    user.role = dto.role;
    user.email = dto.email ?? null;
    user.phone = dto.phone ?? null;
    user.department = dto.department ?? null;
    user.isActive = dto.isActive !== undefined ? dto.isActive : true;
    user.createdBy = createdById;

    const saved = await this.userRepo.save(user);
    return this.sanitizeUser(saved);
  }

  async update(id: number, dto: UpdateUserDto) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('用戶不存在');

    if (dto.password) {
      user.password = await bcrypt.hash(dto.password, 10);
    }
    if (dto.displayName !== undefined) user.displayName = dto.displayName;
    if (dto.role !== undefined) user.role = dto.role;
    if (dto.email !== undefined) user.email = dto.email ?? null;
    if (dto.phone !== undefined) user.phone = dto.phone ?? null;
    if (dto.department !== undefined) user.department = dto.department ?? null;
    if (dto.isActive !== undefined) user.isActive = dto.isActive;

    const saved = await this.userRepo.save(user);
    return this.sanitizeUser(saved);
  }

  async toggleActive(id: number) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('用戶不存在');

    user.isActive = !user.isActive;
    const saved = await this.userRepo.save(user);
    return this.sanitizeUser(saved);
  }

  private sanitizeUser(user: User) {
    const { password, ...result } = user;
    return result;
  }
}
