import {
  Controller, Get, Post, Put, Delete, Res,
  Body, Query, Param, ParseIntPipe, UseGuards, Request,
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { AcceptanceReportsService } from './acceptance-reports.service';

const UPLOAD_DIR = join(process.cwd(), 'uploads', 'acceptance-reports');
if (!existsSync(UPLOAD_DIR)) {
  mkdirSync(UPLOAD_DIR, { recursive: true });
}

@Controller('acceptance-reports')
@UseGuards(AuthGuard('jwt'))
export class AcceptanceReportsController {
  constructor(private readonly service: AcceptanceReportsService) {}

  @Get()
  findAll(@Query() query: any) {
    return this.service.findAll(query);
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
  create(@Request() req: any, @Body() dto: any) {
    return this.service.create(req.user.sub, dto);
  }

  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: any,
    @Body() dto: any,
  ) {
    return this.service.update(id, req.user.sub, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
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
    const url = `${baseUrl}/uploads/acceptance-reports/${file.filename}`;
    return {
      url,
      filename: file.filename,
      file_name: file.originalname,
      file_type: file.mimetype,
    };
  }

  @Get(':id/pdf')
  async exportPdf(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    const report = await this.service.findOne(id);
    const fmtDate = (d: any) => d ? new Date(d).toLocaleDateString('zh-HK') : '-';

    const sigSection = (label: string, sigUrl: string | null) => {
      if (!sigUrl) return `<div class="sig-box"><div class="sig-label">${label}</div><div class="sig-empty">未簽名</div></div>`;
      return `<div class="sig-box"><div class="sig-label">${label}</div><img src="${sigUrl}" class="sig-img" /></div>`;
    };

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      body { font-family: 'Noto Sans TC', Arial, sans-serif; padding: 40px; font-size: 14px; }
      h1 { text-align: center; font-size: 22px; margin-bottom: 20px; }
      .header-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
      .header-table td { padding: 6px 10px; border: 1px solid #ccc; }
      .header-table .label { font-weight: bold; background: #f5f5f5; width: 120px; }
      .section { margin-top: 20px; }
      .section-title { font-weight: bold; font-size: 15px; margin-bottom: 8px; border-bottom: 2px solid #333; padding-bottom: 4px; }
      .sig-row { display: flex; gap: 40px; margin-top: 30px; }
      .sig-box { flex: 1; text-align: center; }
      .sig-label { font-weight: bold; margin-bottom: 8px; }
      .sig-img { max-height: 80px; border: 1px solid #ccc; border-radius: 4px; }
      .sig-empty { color: #999; font-style: italic; }
    </style></head><body>
      <h1>明達建築工程收貨報告</h1>
      <table class="header-table">
        <tr><td class="label">報告日期</td><td>${fmtDate(report.acceptance_report_date)}</td><td class="label">驗收日期</td><td>${fmtDate(report.acceptance_report_acceptance_date)}</td></tr>
        <tr><td class="label">工程名稱</td><td colspan="3">${report.acceptance_report_project_name || '-'}</td></tr>
        <tr><td class="label">客戶</td><td>${report.acceptance_report_client_name || '-'}</td><td class="label">合約編號</td><td>${report.acceptance_report_contract_ref || '-'}</td></tr>
        <tr><td class="label">地盤地址</td><td colspan="3">${report.acceptance_report_site_address || '-'}</td></tr>
      </table>
      <div class="section"><div class="section-title">收貨項目</div><p>${(report.acceptance_report_items || '').replace(/\n/g, '<br>')}</p></div>
      ${report.acceptance_report_quantity_unit ? `<div class="section"><strong>數量/單位：</strong> ${report.acceptance_report_quantity_unit}</div>` : ''}
      <div class="section"><div class="section-title">驗收人員</div>
        <table class="header-table">
          <tr><td class="label">明達驗收人</td><td>${(report as any).inspector?.name_zh || '-'} (${report.acceptance_report_mingtat_inspector_title})</td></tr>
          <tr><td class="label">客戶驗收人</td><td>${report.acceptance_report_client_inspector_name} (${report.acceptance_report_client_inspector_title})</td></tr>
        </table>
      </div>
      ${report.acceptance_report_supplementary_notes ? `<div class="section"><div class="section-title">補充說明</div><p>${report.acceptance_report_supplementary_notes.replace(/\n/g, '<br>')}</p></div>` : ''}
      <div class="sig-row">
        ${sigSection('明達簽名', report.acceptance_report_mingtat_signature)}
        ${sigSection('客戶簽名', report.acceptance_report_client_signature)}
      </div>
    </body></html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="acceptance-report-${id}.html"`);
    res.send(html);
  }
}
