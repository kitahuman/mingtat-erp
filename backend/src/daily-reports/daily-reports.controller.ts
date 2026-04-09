import {
  Controller, Get, Post, Put, Delete, Res,
  Body, Query, Param, ParseIntPipe, UseGuards, Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { DailyReportsService } from './daily-reports.service';

@Controller('daily-reports')
@UseGuards(AuthGuard('jwt'))
export class DailyReportsController {
  constructor(private readonly service: DailyReportsService) {}

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

  @Get(':id/pdf')
  async exportPdf(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    const report = await this.service.findOne(id);
    const categoryLabels: Record<string, string> = { worker: '工人', vehicle: '車輛', machinery: '機械', tool: '工具' };
    const shiftLabels: Record<string, string> = { day: '日更', night: '夜更' };
    const fmtDate = (d: any) => d ? new Date(d).toLocaleDateString('zh-HK') : '-';

    let itemsHtml = '';
    if (report.items?.length) {
      itemsHtml = `<table class="items-table">
        <thead><tr><th>類別</th><th>內容</th><th>數量</th><th>OT小時</th><th>名稱/車牌</th></tr></thead>
        <tbody>${report.items.map((item: any) => `<tr><td>${categoryLabels[item.daily_report_item_category] || item.daily_report_item_category}</td><td>${item.daily_report_item_content}</td><td>${item.daily_report_item_quantity || '-'}</td><td>${item.daily_report_item_ot_hours || '-'}</td><td>${item.daily_report_item_name_or_plate || '-'}</td></tr>`).join('')}</tbody>
      </table>`;
    }

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      body { font-family: 'Noto Sans TC', Arial, sans-serif; padding: 40px; font-size: 14px; }
      h1 { text-align: center; font-size: 22px; margin-bottom: 20px; }
      .header-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
      .header-table td { padding: 6px 10px; border: 1px solid #ccc; }
      .header-table .label { font-weight: bold; background: #f5f5f5; width: 120px; }
      .items-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
      .items-table th, .items-table td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
      .items-table th { background: #f5f5f5; font-weight: bold; }
      .section { margin-top: 20px; }
      .section-title { font-weight: bold; font-size: 15px; margin-bottom: 8px; border-bottom: 2px solid #333; padding-bottom: 4px; }
    </style></head><body>
      <h1>明達建築工程日報</h1>
      <table class="header-table">
        <tr><td class="label">工程名稱</td><td>${report.project?.project_name || '-'}</td><td class="label">工程編號</td><td>${report.project?.project_no || '-'}</td></tr>
        <tr><td class="label">日期</td><td>${fmtDate(report.daily_report_date)}</td><td class="label">更次</td><td>${shiftLabels[report.daily_report_shift_type] || report.daily_report_shift_type}</td></tr>
        <tr><td class="label">建立人</td><td>${(report as any).creator?.displayName || '-'}</td><td class="label">狀態</td><td>${report.daily_report_status === 'submitted' ? '已提交' : '草稿'}</td></tr>
      </table>
      <div class="section"><div class="section-title">工作摘要</div><p>${(report.daily_report_work_summary || '').replace(/\n/g, '<br>')}</p></div>
      ${report.items?.length ? `<div class="section"><div class="section-title">Labour and Plant</div>${itemsHtml}</div>` : ''}
      ${report.daily_report_memo ? `<div class="section"><div class="section-title">備忘錄</div><p>${report.daily_report_memo.replace(/\n/g, '<br>')}</p></div>` : ''}
    </body></html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="daily-report-${id}.html"`);
    res.send(html);
  }
}
