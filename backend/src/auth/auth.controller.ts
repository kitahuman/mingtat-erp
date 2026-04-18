import { Controller, Post, Body, Get, UseGuards, Request, BadRequestException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { DirectorWritable } from './director-writable.decorator';
import { LoginDto } from './login.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @DirectorWritable()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @ApiOperation({ summary: '用戶登入' })
  async login(@Body() body: LoginDto) {
    if (!body.username || !body.password) {
      throw new BadRequestException('用戶名和密碼不能為空');
    }
    return this.authService.login(body.username, body.password);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('profile')
  async getProfile(@Request() req: any) {
    return this.authService.getProfile(req.user.sub);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('page-definitions')
  getPageDefinitions() {
    return this.authService.getAllPages();
  }
}
