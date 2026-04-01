import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  Optional,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { EmployeePortalService } from './employee-portal.service';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';

// Ensure upload directory exists
const uploadDir = join(process.cwd(), 'uploads', 'employee-portal');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = diskStorage({
  destination: uploadDir,
  filename: (_req, file, cb) => {
    cb(null, `${uuidv4()}${extname(file.originalname)}`);
  },
});

@Controller('employee-portal')
export class EmployeePortalController {
  constructor(private readonly service: EmployeePortalService) {}

  // ── Auth ───────────────────────────────────────────────
  // Accepts phone number OR username (admin accounts can use username for testing)
  @Post('login')
  async login(
    @Body()
    body: {
      identifier?: string;
      phone?: string;
      username?: string;
      password: string;
    },
  ) {
    // Support multiple field names for flexibility
    const identifier = body.identifier || body.phone || body.username || '';
    return this.service.loginByPhone(identifier, body.password);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('profile')
  async getProfile(@Request() req: any) {
    return this.service.getEmployeeProfile(req.user.sub);
  }

  // ── Admin: Create employee user account ───────────────────────
  @UseGuards(AuthGuard('jwt'))
  @Post('create-account')
  async createAccount(
    @Request() req: any,
    @Body() body: { phone: string; displayName: string; employee_id?: number },
  ) {
    return this.service.createEmployeeUser(body);
  }

  // ── Attendance (打卡) ──────────────────────────────────────────
  @UseGuards(AuthGuard('jwt'))
  @Post('attendance')
  async clockInOut(
    @Request() req: any,
    @Body()
    body: {
      type: 'clock_in' | 'clock_out';
      photo_url?: string;
      latitude?: number;
      longitude?: number;
      address?: string;
      remarks?: string;
    },
  ) {
    return this.service.clockInOut(req.user.sub, body);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('attendance/today')
  async getTodayAttendance(@Request() req: any) {
    return this.service.getTodayAttendance(req.user.sub);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('attendance/history')
  async getAttendanceHistory(
    @Request() req: any,
    @Query() query: { page?: number; limit?: number },
  ) {
    return this.service.getAttendanceHistory(req.user.sub, query);
  }

  // ── Photo Upload ───────────────────────────────────────────────
  @UseGuards(AuthGuard('jwt'))
  @Post('upload-photo')
  @UseInterceptors(FileInterceptor('file', { storage }))
  async uploadPhoto(
    @Request() req: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      return { url: null };
    }
    const baseUrl = process.env.BACKEND_PUBLIC_URL || `http://localhost:${process.env.PORT || 3001}`;
    const url = `${baseUrl}/uploads/employee-portal/${file.filename}`;
    return { url, filename: file.filename };
  }

  // ── Leave (請假) ───────────────────────────────────────────────
  @UseGuards(AuthGuard('jwt'))
  @Post('leave')
  async submitLeave(
    @Request() req: any,
    @Body()
    body: {
      leave_type: 'sick' | 'annual';
      date_from: string;
      date_to: string;
      days: number;
      reason?: string;
    },
  ) {
    return this.service.submitLeave(req.user.sub, body);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('leave')
  async getLeaveRecords(
    @Request() req: any,
    @Query() query: { page?: number; limit?: number },
  ) {
    return this.service.getLeaveRecords(req.user.sub, query);
  }

  // ── Work Logs (報工) ───────────────────────────────────────────
  @UseGuards(AuthGuard('jwt'))
  @Post('work-logs')
  async submitWorkLog(@Request() req: any, @Body() body: any) {
    return this.service.submitWorkLog(req.user.sub, body);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('work-logs')
  async getMyWorkLogs(
    @Request() req: any,
    @Query() query: { page?: number; limit?: number },
  ) {
    return this.service.getMyWorkLogs(req.user.sub, query);
  }

  // ── Expenses (報銷) ────────────────────────────────────────────
  @UseGuards(AuthGuard('jwt'))
  @Post('expenses')
  async submitExpense(@Request() req: any, @Body() body: any) {
    return this.service.submitExpense(req.user.sub, body);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('expenses')
  async getMyExpenses(
    @Request() req: any,
    @Query() query: { page?: number; limit?: number },
  ) {
    return this.service.getMyExpenses(req.user.sub, query);
  }

  // ── Payrolls (糧單) ────────────────────────────────────────────
  @UseGuards(AuthGuard('jwt'))
  @Get('payrolls')
  async getMyPayrolls(
    @Request() req: any,
    @Query() query: { page?: number; limit?: number },
  ) {
    return this.service.getMyPayrolls(req.user.sub, query);
  }

  // ── Dashboard ──────────────────────────────────────────────────
  @UseGuards(AuthGuard('jwt'))
  @Get('dashboard')
  async getDashboard(@Request() req: any) {
    return this.service.getDashboard(req.user.sub);
  }

  // ── Certificates (證件) ────────────────────────────────────────
  @UseGuards(AuthGuard('jwt'))
  @Get('certificates')
  async getCertificates(@Request() req: any) {
    return this.service.getCertificates(req.user.sub);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('certificates/photo')
  async updateCertPhoto(
    @Request() req: any,
    @Body() body: { cert_key: string; photo_url: string },
  ) {
    return this.service.updateCertPhoto(req.user.sub, body.cert_key, body.photo_url);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('certificates/expiring')
  async getExpiringCerts(
    @Request() req: any,
    @Query('days') days?: number,
  ) {
    return this.service.getExpiringCerts(req.user.sub, days ? Number(days) : 90);
  }
}
