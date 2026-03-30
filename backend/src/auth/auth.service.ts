import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { User } from './user.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    private jwtService: JwtService,
  ) {}

  async login(username: string, password: string) {
    const user = await this.userRepo.findOne({ where: { username } });
    if (!user || !user.is_active) {
      throw new UnauthorizedException('帳號或密碼錯誤');
    }
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      throw new UnauthorizedException('帳號或密碼錯誤');
    }
    const payload = { sub: user.id, username: user.username, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
      user: { id: user.id, username: user.username, display_name: user.display_name, role: user.role },
    };
  }

  async getProfile(userId: number) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    return { id: user.id, username: user.username, display_name: user.display_name, role: user.role };
  }

  async seedAdmin() {
    const exists = await this.userRepo.findOne({ where: { username: 'admin' } });
    if (!exists) {
      const hashed = await bcrypt.hash('admin123', 10);
      await this.userRepo.save({ username: 'admin', password: hashed, display_name: '系統管理員', role: 'admin' });
      console.log('Admin user seeded: admin / admin123');
    }
  }
}
