import {
  Controller, Get, Post, Put, Delete, Res,
  Body, Query, Param, ParseIntPipe, UseGuards, Request,
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import type { Response } from 'express';
import { DailyReportsService } from './daily-reports.service';
import { CreateDailyReportDto, UpdateDailyReportDto } from './dto/create-daily-report.dto';

const UPLOAD_DIR = join(process.cwd(), 'uploads', 'daily-reports');
if (!existsSync(UPLOAD_DIR)) {
  mkdirSync(UPLOAD_DIR, { recursive: true });
}

@Controller('daily-reports')
@UseGuards(AuthGuard('jwt'))
export class DailyReportsController {
  constructor(private readonly service: DailyReportsService) {}

  @Get()
  findAll(@Query() query: any) {
    return this.service.findAll(query);
  }

  @Get('project-names')
  getDistinctProjectNames() {
    return this.service.getDistinctProjectNames();
  }

  @Get('by-project/:projectId')
  findByProject(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Query() query: any,
  ) {
    return this.service.findByProject(projectId, query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Request() req: any, @Body() dto: CreateDailyReportDto) {
    return this.service.create(req.user.sub, dto);
  }

  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: any,
    @Body() dto: UpdateDailyReportDto,
  ) {
    return this.service.update(id, req.user.sub, dto);
  }

  /** Admin-only: force update even submitted reports */
  @Put(':id/admin-update')
  adminUpdate(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: any,
    @Body() dto: UpdateDailyReportDto,
  ) {
    return this.service.update(id, req.user.sub, dto, true);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.service.remove(id, req.user?.id || req.user?.userId || undefined);
  }

  // ── File Upload ─────────────────────────────────────────────────
  @Post('upload')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: UPLOAD_DIR,
      filename: (_req, file, cb) => {
        cb(null, `${uuidv4()}${extname(file.originalname)}`);
      },
    }),
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  }))
  async uploadFile(
    @Request() req: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      return { url: null };
    }
    const baseUrl = process.env.BACKEND_PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
    const url = `${baseUrl}/uploads/daily-reports/${file.filename}`;
    return {
      url,
      filename: file.filename,
      file_name: file.originalname,
      file_type: file.mimetype,
    };
  }

  // ── Add attachments to submitted report ─────────────────────────
  @Post(':id/attachments')
  async addAttachments(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: any,
    @Body() dto: { attachments: { file_name: string; file_url: string; file_type: string }[] },
  ) {
    return this.service.addAttachments(id, req.user.sub, dto.attachments);
  }

  // ── Delete single attachment ────────────────────────────────────
  @Delete(':id/attachments/:attachmentId')
  async removeAttachment(
    @Param('id', ParseIntPipe) id: number,
    @Param('attachmentId', ParseIntPipe) attachmentId: number,
    @Request() req: any,
  ) {
    return this.service.removeAttachment(id, attachmentId, req.user.sub);
  }

  @Get(':id/export')
  async exportHtml(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    const report = await this.service.findOne(id);
    const categoryLabels: Record<string, string> = { worker: '工人', vehicle: '車輛/機械', machinery: '車輛/機械', tool: '工具' };
    const shiftLabels: Record<string, string> = { day: '日更', night: '夜更' };
    const fmtDate = (d: any) => d ? new Date(d).toLocaleDateString('zh-HK') : '-';

    const projectName = report.daily_report_project_name || report.project?.project_name || '-';
    const projectLocation = report.daily_report_project_location || '-';
    const projectNo = report.project?.project_no || '-';
    const clientName = report.daily_report_client_name || (report as any).client?.name || '-';

    // Build items table rows
    let itemsHtml = '';
    if (report.items?.length) {
      const rows = report.items.map((item: any) => {
        const cat = item.daily_report_item_category;
        const catLabel = categoryLabels[cat] || cat;

        let details = item.daily_report_item_content || '';
        if (cat === 'worker' && item.daily_report_item_worker_type) {
          details = `[${item.daily_report_item_worker_type}] ${details}`;
        }
        if ((cat === 'vehicle' || cat === 'machinery') && item.daily_report_item_with_operator) {
          details = `[連機手/司機] ${details}`;
        }

        // Parse employee/vehicle IDs
        let employeeInfo = '';
        if (item.daily_report_item_employee_ids) {
          try {
            const ids = JSON.parse(item.daily_report_item_employee_ids);
            if (Array.isArray(ids) && ids.length > 0) {
              employeeInfo = ids.map((e: any) => typeof e === 'string' && e.startsWith('manual:') ? e.replace('manual:', '') : e).join(', ');
            }
          } catch { employeeInfo = item.daily_report_item_employee_ids; }
        }

        let vehicleInfo = '';
        if (item.daily_report_item_vehicle_ids) {
          try {
            const ids = JSON.parse(item.daily_report_item_vehicle_ids);
            if (Array.isArray(ids) && ids.length > 0) {
              vehicleInfo = ids.map((v: any) => typeof v === 'string' && v.startsWith('manual:') ? v.replace('manual:', '') : v).join(', ');
            }
          } catch { vehicleInfo = item.daily_report_item_vehicle_ids; }
        }

        return `<tr>
          <td>${catLabel}</td>
          <td>${details}</td>
          <td>${item.daily_report_item_quantity || '-'}</td>
          <td>${item.daily_report_item_shift_quantity || '-'}</td>
          <td>${item.daily_report_item_ot_hours || '-'}</td>
          <td>${employeeInfo || item.daily_report_item_name_or_plate || '-'}</td>
          <td>${vehicleInfo || '-'}</td>
        </tr>`;
      }).join('');

      itemsHtml = `<table class="items-table">
        <thead><tr><th>類別</th><th>內容</th><th>數量</th><th>中直</th><th>OT</th><th>員工</th><th>機號/車牌</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
    }

    // Build attachments section
    let attachmentsHtml = '';
    if ((report as any).attachments?.length) {
      const attItems = (report as any).attachments.map((a: any) => {
        if (a.daily_report_attachment_file_type?.startsWith('image/')) {
          return `<div style="display:inline-block;margin:5px;"><img src="${a.daily_report_attachment_file_url}" style="max-width:200px;max-height:200px;border:1px solid #ccc;border-radius:4px;" /><br/><small>${a.daily_report_attachment_file_name}</small></div>`;
        }
        return `<div style="display:inline-block;margin:5px;padding:10px;border:1px solid #ccc;border-radius:4px;"><a href="${a.daily_report_attachment_file_url}" target="_blank">${a.daily_report_attachment_file_name}</a></div>`;
      }).join('');
      attachmentsHtml = `<div class="section"><div class="section-title">附件</div>${attItems}</div>`;
    }

    const sigSection = (sigUrl: string | null) => {
      if (!sigUrl) return '<div class="sig-empty">未簽名</div>';
      return `<img src="${sigUrl}" class="sig-img" />`;
    };

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      @media print { body { padding: 20px; } }
      body { font-family: 'Noto Sans TC', Arial, sans-serif; padding: 40px; font-size: 14px; max-width: 900px; margin: 0 auto; }
      h1 { text-align: center; font-size: 22px; margin-bottom: 20px; }
      .header-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
      .header-table td { padding: 6px 10px; border: 1px solid #ccc; }
      .header-table .label { font-weight: bold; background: #f5f5f5; width: 120px; }
      .items-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
      .items-table th, .items-table td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; font-size: 13px; }
      .items-table th { background: #f5f5f5; font-weight: bold; }
      .section { margin-top: 20px; }
      .section-title { font-weight: bold; font-size: 15px; margin-bottom: 8px; border-bottom: 2px solid #333; padding-bottom: 4px; }
      .sig-row { margin-top: 30px; text-align: center; }
      .sig-img { max-height: 80px; border: 1px solid #ccc; border-radius: 4px; }
      .sig-empty { color: #999; font-style: italic; }
      .print-btn { display: block; margin: 20px auto; padding: 10px 30px; background: #2563eb; color: white; border: none; border-radius: 8px; font-size: 16px; cursor: pointer; }
      @media print { .print-btn { display: none; } }
    </style></head><body>
      <button class="print-btn" onclick="window.print()">列印</button>
      <h1>明達建築工程日報</h1>
      <table class="header-table">
        <tr><td class="label">工程名稱</td><td>${projectName}</td><td class="label">工程編號</td><td>${projectNo}</td></tr>
        <tr><td class="label">工程地點</td><td>${projectLocation}</td><td class="label">客戶合約</td><td>${report.daily_report_client_contract_no || '-'}</td></tr>
        <tr><td class="label">客戶</td><td>${clientName}</td><td class="label">日期</td><td>${fmtDate(report.daily_report_date)}</td></tr>
        <tr><td class="label">更次</td><td>${shiftLabels[report.daily_report_shift_type] || report.daily_report_shift_type}</td><td class="label">建立人</td><td>${(report as any).creator?.displayName || '-'}</td></tr>
        <tr><td class="label">狀態</td><td colspan="3">${report.daily_report_status === 'submitted' ? '已提交' : '草稿'}</td></tr>
      </table>
      <div class="section"><div class="section-title">工作摘要</div><p>${(report.daily_report_work_summary || '').replace(/\n/g, '<br>')}</p></div>
      ${report.items?.length ? `<div class="section"><div class="section-title">Labour and Plant</div>${itemsHtml}</div>` : ''}
      ${report.daily_report_completed_work ? `<div class="section"><div class="section-title">完成的工作</div><p>${report.daily_report_completed_work.replace(/\n/g, '<br>')}</p></div>` : ''}
      ${report.daily_report_memo ? `<div class="section"><div class="section-title">備忘錄</div><p>${report.daily_report_memo.replace(/\n/g, '<br>')}</p></div>` : ''}
      ${attachmentsHtml}
      <div class="sig-row">
        <div class="section-title" style="text-align:left">簽收</div>
        ${sigSection(report.daily_report_signature)}
      </div>
    </body></html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="daily-report-${id}.html"`);
    res.send(html);
  }

  // Keep old /pdf route as alias
  @Get(':id/pdf')
  async exportPdf(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    return this.exportHtml(id, res);
  }
}
