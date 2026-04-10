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

  @Get(':id/export')
  async exportHtml(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    const report = await this.service.findOne(id);
    const fmtDate = (d: any) => d ? new Date(d).toLocaleDateString('zh-HK') : '-';

    const projectName = report.acceptance_report_project_name || report.project?.project_name || '-';
    const clientName = report.acceptance_report_client_name || (report as any).client?.name || '-';
    const inspectorName = report.acceptance_report_mingtat_inspector_name || (report as any).inspector?.name_zh || '-';

    // Dynamic acceptance items table
    let itemsHtml = '';
    if ((report as any).acceptance_items?.length) {
      const rows = (report as any).acceptance_items.map((item: any, idx: number) =>
        `<tr><td>${idx + 1}</td><td>${item.acceptance_report_item_description || '-'}</td><td>${item.acceptance_report_item_quantity_unit || '-'}</td></tr>`
      ).join('');
      itemsHtml = `<table class="items-table">
        <thead><tr><th>#</th><th>項目描述</th><th>數量/單位</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
    }
    // Fallback to legacy single text field
    if (!itemsHtml && report.acceptance_report_items) {
      itemsHtml = `<p>${report.acceptance_report_items.replace(/\n/g, '<br>')}</p>`;
      if (report.acceptance_report_quantity_unit) {
        itemsHtml += `<p><strong>數量/單位：</strong> ${report.acceptance_report_quantity_unit}</p>`;
      }
    }

    const sigSection = (label: string, sigUrl: string | null) => {
      if (!sigUrl) return `<div class="sig-box"><div class="sig-label">${label}</div><div class="sig-empty">未簽名</div></div>`;
      return `<div class="sig-box"><div class="sig-label">${label}</div><img src="${sigUrl}" class="sig-img" /></div>`;
    };

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      @media print { body { padding: 20px; } .print-btn { display: none; } }
      body { font-family: 'Noto Sans TC', Arial, sans-serif; padding: 40px; font-size: 14px; max-width: 900px; margin: 0 auto; }
      h1 { text-align: center; font-size: 22px; margin-bottom: 20px; }
      .header-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
      .header-table td { padding: 6px 10px; border: 1px solid #ccc; }
      .header-table .label { font-weight: bold; background: #f5f5f5; width: 120px; }
      .items-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
      .items-table th, .items-table td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
      .items-table th { background: #f5f5f5; font-weight: bold; }
      .section { margin-top: 20px; }
      .section-title { font-weight: bold; font-size: 15px; margin-bottom: 8px; border-bottom: 2px solid #333; padding-bottom: 4px; }
      .sig-row { display: flex; gap: 40px; margin-top: 30px; }
      .sig-box { flex: 1; text-align: center; }
      .sig-label { font-weight: bold; margin-bottom: 8px; }
      .sig-img { max-height: 80px; border: 1px solid #ccc; border-radius: 4px; }
      .sig-empty { color: #999; font-style: italic; }
      .print-btn { display: block; margin: 20px auto; padding: 10px 30px; background: #2563eb; color: white; border: none; border-radius: 8px; font-size: 16px; cursor: pointer; }
    </style></head><body>
      <button class="print-btn" onclick="window.print()">列印</button>
      <h1>明達建築工程收貨報告</h1>
      <table class="header-table">
        <tr><td class="label">報告日期</td><td>${fmtDate(report.acceptance_report_date)}</td><td class="label">驗收日期</td><td>${fmtDate(report.acceptance_report_acceptance_date)}</td></tr>
        <tr><td class="label">客戶</td><td>${clientName}</td><td class="label">客戶合約</td><td>${report.acceptance_report_client_contract_no || '-'}</td></tr>
        <tr><td class="label">工程名稱</td><td colspan="3">${projectName}</td></tr>
        <tr><td class="label">合約參考</td><td>${report.acceptance_report_contract_ref || '-'}</td><td class="label">狀態</td><td>${report.acceptance_report_status === 'submitted' ? '已提交' : '草稿'}</td></tr>
        <tr><td class="label">地盤地址</td><td colspan="3">${report.acceptance_report_site_address || '-'}</td></tr>
      </table>
      <div class="section"><div class="section-title">收貨項目</div>${itemsHtml}</div>
      <div class="section"><div class="section-title">驗收人員</div>
        <table class="header-table">
          <tr><td class="label">明達方</td><td>${inspectorName} (${report.acceptance_report_mingtat_inspector_title || '-'})</td></tr>
          <tr><td class="label">客戶方</td><td>${report.acceptance_report_client_inspector_name || '-'} (${report.acceptance_report_client_inspector_title || '-'})</td></tr>
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

  // Keep old /pdf route as alias
  @Get(':id/pdf')
  async exportPdf(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    return this.exportHtml(id, res);
  }
}
