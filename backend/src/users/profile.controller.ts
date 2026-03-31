import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  UseGuards,
  Request,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../auth/user.entity';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@Controller('profile')
@UseGuards(AuthGuard('jwt'))
export class ProfileController {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
  ) {}

  /**
   * GET /api/profile
   * Get current user's profile
   */
  @Get()
  async getProfile(@Request() req: any) {
    const user = await this.userRepo.findOne({ where: { id: req.user.sub } });
    if (!user) throw new UnauthorizedException();
    const { password, ...result } = user;
    return result;
  }

  /**
   * PUT /api/profile
   * Update current user's profile (displayName, email, phone)
   */
  @Put()
  async updateProfile(@Request() req: any, @Body() dto: UpdateProfileDto) {
    const user = await this.userRepo.findOne({ where: { id: req.user.sub } });
    if (!user) throw new UnauthorizedException();

    if (dto.displayName !== undefined) user.displayName = dto.displayName;
    if (dto.email !== undefined) user.email = dto.email ?? null;
    if (dto.phone !== undefined) user.phone = dto.phone ?? null;

    const saved = await this.userRepo.save(user);
    const { password, ...result } = saved;
    return result;
  }

  /**
   * POST /api/profile/change-password
   * Change current user's password (requires old password)
   */
  @Post('change-password')
  async changePassword(@Request() req: any, @Body() dto: ChangePasswordDto) {
    const user = await this.userRepo.findOne({ where: { id: req.user.sub } });
    if (!user) throw new UnauthorizedException();

    const valid = await bcrypt.compare(dto.oldPassword, user.password);
    if (!valid) {
      throw new UnauthorizedException('舊密碼不正確');
    }

    user.password = await bcrypt.hash(dto.newPassword, 10);
    await this.userRepo.save(user);

    return { message: '密碼已成功修改' };
  }
}
