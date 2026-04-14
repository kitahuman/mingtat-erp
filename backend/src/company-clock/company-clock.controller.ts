import {
  Controller,
  Post,
  Get,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CompanyClockService } from './company-clock.service';

@Controller('company-clock')
export class CompanyClockController {
  constructor(private readonly service: CompanyClockService) {}

  // ── Auth ───────────────────────────────────────────────
  @Post('login')
  async login(
    @Body() body: { identifier: string; password: string },
  ) {
    return this.service.login(body.identifier, body.password);
  }

  // ── Employee List (for selecting who to clock in) ──────
  @UseGuards(AuthGuard('jwt'))
  @Get('employees')
  async getEmployeeList(
    @Query() query: {
      search?: string;
      company_id?: number;
      status?: string;
      page?: number;
      limit?: number;
    },
  ) {
    return this.service.getEmployeeList(query);
  }

  // ── Companies (for filter dropdown) ────────────────────
  @UseGuards(AuthGuard('jwt'))
  @Get('companies')
  async getCompanies() {
    return this.service.getCompanies();
  }

  // ── Get employee standard photo ────────────────────────
  @UseGuards(AuthGuard('jwt'))
  @Get('employees/:id/photo')
  async getEmployeePhoto(@Param('id') id: string) {
    return this.service.getEmployeePhoto(Number(id));
  }

  // ── Upload/Update employee standard photo ──────────────
  @UseGuards(AuthGuard('jwt'))
  @Put('employees/:id/photo')
  async updateEmployeePhoto(
    @Param('id') id: string,
    @Body() body: { photo_base64: string },
  ) {
    return this.service.updateEmployeePhoto(Number(id), body.photo_base64);
  }

  // ── Check if temporary employee name already exists ────
  @UseGuards(AuthGuard('jwt'))
  @Get('temporary-employee/check-name')
  async checkTemporaryEmployeeName(@Query('name_zh') name_zh: string) {
    return this.service.checkTemporaryEmployeeName(name_zh);
  }

  // ── Clock In/Out with Face Recognition ─────────────────
  @UseGuards(AuthGuard('jwt'))
  @Post('clock')
  async clockIn(
    @Request() req: any,
    @Body()
    body: {
      employee_id: number;
      photo_base64: string;
      type: 'clock_in' | 'clock_out';
      latitude?: number;
      longitude?: number;
      address?: string;
      remarks?: string;
      is_mid_shift?: boolean;
      work_notes?: string;
    },
  ) {
    return this.service.clockIn({
      ...body,
      operator_user_id: req.user.sub,
    });
  }

  // ── Create Temporary Employee ──────────────────────────
  @UseGuards(AuthGuard('jwt'))
  @Post('temporary-employee')
  async createTemporaryEmployee(
    @Request() req: any,
    @Body()
    body: {
      name_zh: string;
      name_en?: string;
      phone?: string;
      photo_base64: string;
      company_id?: number;
      role?: string;
      work_notes?: string;
      is_mid_shift?: boolean;
      type?: 'clock_in' | 'clock_out';
      latitude?: number;
      longitude?: number;
      address?: string;
    },
  ) {
    return this.service.createTemporaryEmployee({
      company_id: body.company_id || null,
      ...body,
      operator_user_id: req.user.sub,
    });
  }

  // ── Today's Attendance Records ─────────────────────────
  @UseGuards(AuthGuard('jwt'))
  @Get('today-attendances')
  async getTodayAttendances(
    @Query() query: { company_id?: number; search?: string },
  ) {
    return this.service.getTodayAttendances(query);
  }
}
