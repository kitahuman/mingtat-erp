import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Param,
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

  // ── Admin: Create employee user account ─────────────────────────────
  @UseGuards(AuthGuard('jwt'))
  @Post('create-account')
  async createAccount(
    @Request() req: any,
    @Body() body: { phone: string; displayName: string; employee_id?: number },
  ) {
    return this.service.createEmployeeUser(body);
  }

  // ── Admin: Get employees without accounts ─────────────────────────────────
  @UseGuards(AuthGuard('jwt'))
  @Get('employees-without-accounts')
  async getEmployeesWithoutAccounts() {
    return this.service.getEmployeesWithoutAccounts();
  }

  // ── Admin: Create accounts for selected employees ──────────────────────────
  @UseGuards(AuthGuard('jwt'))
  @Post('create-accounts-for-selected')
  async createAccountsForSelected(
    @Body() body: { employee_ids: number[] },
  ) {
    return this.service.createAccountsForSelectedEmployees(body.employee_ids);
  }

  // ── Admin: Bulk create accounts for all employees with phone numbers ────────
  @UseGuards(AuthGuard('jwt'))
  @Post('bulk-create-accounts')
  async bulkCreateAccounts(@Request() req: any) {
    return this.service.bulkCreateEmployeeAccounts();
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
      attendance_photo_base64?: string;
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
    const baseUrl = process.env.BACKEND_PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
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
  @Post('certificates/update')
  async updateCertificate(
    @Request() req: any,
    @Body() body: { cert_key: string; cert_no?: string | null; expiry_date?: string | null },
  ) {
    return this.service.updateCertificate(req.user.sub, body.cert_key, body.cert_no ?? null, body.expiry_date ?? null);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('certificates/expiring')
  async getExpiringCerts(
    @Request() req: any,
    @Query('days') days?: number,
  ) {
    return this.service.getExpiringCerts(req.user.sub, days ? Number(days) : 90);
  }

  // ── Mid-Shift Approvals (中直批核) ─────────────────────────────
  @UseGuards(AuthGuard('jwt'))
  @Get('mid-shift-approvals')
  async getPendingMidShiftApprovals(@Request() req: any) {
    return this.service.getPendingMidShiftApprovals(req.user.sub);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('mid-shift-approvals')
  async approveMidShift(
    @Request() req: any,
    @Body() data: { attendance_ids: number[], signature_base64: string }
  ) {
    return this.service.approveMidShift(req.user.sub, data);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('mid-shift-approvals/history')
  async getMidShiftApprovalHistory(
    @Request() req: any,
    @Query() query: { page?: number; limit?: number }
  ) {
    return this.service.getMidShiftApprovalHistory(req.user.sub, query);
  }

  // ── Daily Reports ──────────────────────────────────────────
  @Get('daily-reports')
  @UseGuards(AuthGuard('jwt'))
  async getMyDailyReports(@Request() req: any, @Query() query: any) {
    return this.service.getMyDailyReports(req.user.sub, query);
  }

  @Get('daily-reports/:id')
  @UseGuards(AuthGuard('jwt'))
  async getDailyReport(@Request() req: any, @Param('id') id: string) {
    return this.service.getDailyReport(req.user.sub, +id);
  }

  @Post('daily-reports')
  @UseGuards(AuthGuard('jwt'))
  async createDailyReport(@Request() req: any, @Body() dto: any) {
    return this.service.createDailyReport(req.user.sub, dto);
  }

  // ── Daily Report Attachments ───────────────────────────────
  // NOTE: 'upload' static route MUST be defined BEFORE ':id' dynamic route
  // to prevent NestJS from matching 'upload' as an :id parameter.
  @UseGuards(AuthGuard('jwt'))
  @Post('daily-reports/upload')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: (_req, _file, cb) => {
        const dir = join(process.cwd(), 'uploads', 'daily-reports');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename: (_req, file, cb) => {
        cb(null, `${uuidv4()}${extname(file.originalname)}`);
      },
    }),
    limits: { fileSize: 20 * 1024 * 1024 },
  }))
  async uploadDailyReportFile(
    @Request() req: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) return { url: null };
    const baseUrl = process.env.BACKEND_PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
    const url = `${baseUrl}/uploads/daily-reports/${file.filename}`;
    return { url, filename: file.filename, file_name: file.originalname, file_type: file.mimetype };
  }

  @Post('daily-reports/:id')
  @UseGuards(AuthGuard('jwt'))
  async updateDailyReport(@Request() req: any, @Param('id') id: string, @Body() dto: any) {
    return this.service.updateDailyReport(req.user.sub, +id, dto);
  }

  @Post('daily-reports/:id/delete')
  @UseGuards(AuthGuard('jwt'))
  async deleteDailyReport(@Request() req: any, @Param('id') id: string) {
    return this.service.deleteDailyReport(req.user.sub, +id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('daily-reports/:id/attachments')
  async addDailyReportAttachments(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: { attachments: { file_name: string; file_url: string; file_type: string }[] },
  ) {
    return this.service.addDailyReportAttachments(req.user.sub, +id, dto.attachments);
  }

  @Post('daily-reports/:id/attachments/:attachmentId/delete')
  @UseGuards(AuthGuard('jwt'))
  async removeDailyReportAttachment(
    @Request() req: any,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.service.removeDailyReportAttachment(req.user.sub, +id, +attachmentId);
  }

  // ── Acceptance Reports ─────────────────────────────────────
  @Get('acceptance-reports')
  @UseGuards(AuthGuard('jwt'))
  async getMyAcceptanceReports(@Request() req: any, @Query() query: any) {
    return this.service.getMyAcceptanceReports(req.user.sub, query);
  }

  @Get('acceptance-reports/:id')
  @UseGuards(AuthGuard('jwt'))
  async getAcceptanceReport(@Request() req: any, @Param('id') id: string) {
    return this.service.getAcceptanceReport(req.user.sub, +id);
  }

  @Post('acceptance-reports')
  @UseGuards(AuthGuard('jwt'))
  async createAcceptanceReport(@Request() req: any, @Body() dto: any) {
    return this.service.createAcceptanceReport(req.user.sub, dto);
  }

  @Post('acceptance-reports/:id')
  @UseGuards(AuthGuard('jwt'))
  async updateAcceptanceReport(@Request() req: any, @Param('id') id: string, @Body() dto: any) {
    return this.service.updateAcceptanceReport(req.user.sub, +id, dto);
  }

  @Post('acceptance-reports/:id/delete')
  @UseGuards(AuthGuard('jwt'))
  async deleteAcceptanceReport(@Request() req: any, @Param('id') id: string) {
    return this.service.deleteAcceptanceReport(req.user.sub, +id);
  }

  // ── Shared Data (for supervisor forms) ────────────────────────
  @UseGuards(AuthGuard('jwt'))
  @Get('shared/projects')
  async getProjectsSimple() {
    return this.service.getProjectsSimple();
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('shared/employees')
  async getEmployeesSimple() {
    return this.service.getEmployeesSimple();
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('shared/vehicles')
  async getVehiclesSimple() {
    return this.service.getVehiclesSimple();
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('shared/machinery')
  async getMachinerySimple() {
    return this.service.getMachinerySimple();
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('shared/partners')
  async getPartnersSimple() {
    return this.service.getPartnersSimple();
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('shared/field-options')
  async getFieldOptions(@Query('category') category: string) {
    return this.service.getFieldOptionsByCategory(category);
  }
}
