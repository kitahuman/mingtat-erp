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
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { DirectorWritable } from '../auth/director-writable.decorator';

@Controller('profile')
@UseGuards(AuthGuard('jwt'))
export class ProfileController {
  constructor(private prisma: PrismaService) {}

  /**
   * GET /api/profile
   * Get current user's profile
   */
  @Get()
  async getProfile(@Request() req: any) {
    const user = await this.prisma.user.findUnique({ where: { id: req.user.sub } });
    if (!user) throw new UnauthorizedException();
    const { password, ...result } = user;
    return result;
  }

  /**
   * PUT /api/profile
   * Update current user's profile (displayName, email, phone)
   */
  @Put()
  @DirectorWritable()
  async updateProfile(@Request() req: any, @Body() dto: UpdateProfileDto) {
    const user = await this.prisma.user.findUnique({ where: { id: req.user.sub } });
    if (!user) throw new UnauthorizedException();

    const data: any = {};
    if (dto.displayName !== undefined) data.displayName = dto.displayName;
    if (dto.email !== undefined) data.email = dto.email ?? null;
    if (dto.phone !== undefined) data.phone = dto.phone ?? null;

    const saved = await this.prisma.user.update({ where: { id: req.user.sub }, data });
    const { password, ...result } = saved;
    return result;
  }

  /**
   * POST /api/profile/change-password
   * Change current user's password (requires old password)
   */
  @Post('change-password')
  @DirectorWritable()
  async changePassword(@Request() req: any, @Body() dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: req.user.sub } });
    if (!user) throw new UnauthorizedException();

    const valid = await bcrypt.compare(dto.oldPassword, user.password);
    if (!valid) {
      throw new UnauthorizedException('舊密碼不正確');
    }

    await this.prisma.user.update({
      where: { id: req.user.sub },
      data: { password: await bcrypt.hash(dto.newPassword, 10) },
    });

    return { message: '密碼已成功修改' };
  }
}
