import {
  Controller, Get, Post, Put, Delete,
  Param, Query, Body,
  UseGuards, Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PayrollService } from './payroll.service';

@Controller('payroll')
@UseGuards(AuthGuard('jwt'))
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @Get()
  findAll(@Query() query: any) {
    return this.payrollService.findAll(query);
  }

  @Get('summary')
  getSummary(@Query() query: any) {
    return this.payrollService.getSummary(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.payrollService.findOne(+id);
  }

  // 預覽計糧（不儲存，返回工作記錄明細和計算結果）
  @Post('preview')
  preview(@Body() body: {
    employee_id: number;
    date_from: string;
    date_to: string;
    company_profile_id?: number;
    company_id?: number;
  }) {
    return this.payrollService.preview(body);
  }

  // 準備糧單（建立草稿 + 複製工作記錄到糧單工作記錄，狀態為 preparing）
  @Post('prepare')
  prepare(@Body() body: {
    employee_id: number;
    date_from: string;
    date_to: string;
    company_id?: number;
    period?: string;
  }, @Request() req: any) {
    return this.payrollService.prepare(body, req.user?.id || req.user?.userId || 0);
  }

  // 生成糧單（單一員工 + 日期範圍）
  @Post('generate')
  generate(@Body() body: {
    employee_id: number;
    date_from: string;
    date_to: string;
    company_profile_id?: number;
    company_id?: number;
    period?: string;
  }, @Request() req: any) {
    return this.payrollService.generate(body, req.user?.id || req.user?.userId || 0);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.payrollService.update(+id, body, req.user?.id || req.user?.userId || 0);
  }

  @Post('bulk/confirm')
  bulkConfirm(@Body() body: { ids: number[] }) {
    return this.payrollService.bulkConfirm(body.ids);
  }

  @Post('bulk/mark-paid')
  bulkMarkPaid(@Body() body: { ids: number[]; payment_date?: string; cheque_number?: string }) {
    return this.payrollService.bulkMarkPaid(body.ids, body.payment_date, body.cheque_number);
  }

  // 確認糧單（finalize）─ 自動產生支出記錄
  @Post(':id/finalize')
  finalize(@Param('id') id: string) {
    return this.payrollService.finalize(+id);
  }

  // 撤銷確認 ─ 刪除自動產生的支出記錄
  @Post(':id/unconfirm')
  unconfirm(@Param('id') id: string) {
    return this.payrollService.unconfirm(+id);
  }

  @Post(':id/recalculate')
  recalculate(@Param('id') id: string) {
    return this.payrollService.recalculate(+id);
  }

  // 確定糧單工作記錄並計算糧單（從 preparing 轉為 draft）
  @Post(':id/finalize-preparation')
  finalizePreparation(@Param('id') id: string, @Request() req: any) {
    return this.payrollService.finalizePreparation(+id, req.user?.id || req.user?.userId || 0);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.payrollService.remove(+id, req.user?.id || req.user?.userId || 0);
  }

  // ── 糧單工作記錄管理 ──────────────────────────────────────

  // 編輯糧單工作記錄（只改糧單記錄）
  @Put(':id/work-logs/:pwlId')
  updatePayrollWorkLog(
    @Param('id') id: string,
    @Param('pwlId') pwlId: string,
    @Body() body: any,
  ) {
    return this.payrollService.updatePayrollWorkLog(+id, +pwlId, body);
  }

  // 編輯原始工作記錄（編輯大數據）
  @Put(':id/work-logs/:pwlId/original')
  updateOriginalWorkLog(
    @Param('id') id: string,
    @Param('pwlId') pwlId: string,
    @Body() body: any,
  ) {
    return this.payrollService.updateOriginalWorkLog(+id, +pwlId, body);
  }

  // 從糧單移除工作記錄
  @Post(':id/work-logs/:pwlId/exclude')
  excludePayrollWorkLog(
    @Param('id') id: string,
    @Param('pwlId') pwlId: string,
  ) {
    return this.payrollService.excludePayrollWorkLog(+id, +pwlId);
  }

  // 恢復已移除的工作記錄
  @Post(':id/work-logs/:pwlId/restore')
  restorePayrollWorkLog(
    @Param('id') id: string,
    @Param('pwlId') pwlId: string,
  ) {
    return this.payrollService.restorePayrollWorkLog(+id, +pwlId);
  }

  // ── 自定義調整項管理 ──────────────────────────────────────

  // 新增自定義調整項
  @Post(':id/adjustments')
  addAdjustment(
    @Param('id') id: string,
    @Body() body: { item_name: string; amount: number; remarks?: string },
  ) {
    return this.payrollService.addAdjustment(+id, body);
  }

  // 刪除自定義調整項
  @Delete(':id/adjustments/:adjId')
  removeAdjustment(
    @Param('id') id: string,
    @Param('adjId') adjId: string,
  ) {
    return this.payrollService.removeAdjustment(+id, +adjId);
  }

  // ── 每日津貼管理 ──────────────────────────────────────────

  // 新增每日津貼
  @Post(':id/daily-allowances')
  addDailyAllowance(
    @Param('id') id: string,
    @Body() body: {
      date: string;
      allowance_key: string;
      allowance_name: string;
      amount: number;
      remarks?: string;
    },
  ) {
    return this.payrollService.addDailyAllowance(+id, body);
  }

  // 刪除每日津貼
  @Delete(':id/daily-allowances/:daId')
  removeDailyAllowance(
    @Param('id') id: string,
    @Param('daId') daId: string,
  ) {
    return this.payrollService.removeDailyAllowance(+id, +daId);
  }

  // 批量設定某日的津貼
  @Post(':id/daily-allowances/batch')
  setDailyAllowances(
    @Param('id') id: string,
    @Body() body: {
      date: string;
      allowances: { allowance_key: string; allowance_name: string; amount: number; remarks?: string }[];
    },
  ) {
    return this.payrollService.setDailyAllowances(+id, body);
  }

  // 取得員工可用的津貼選項
  @Get(':id/allowance-options')
  async getAllowanceOptions(@Param('id') id: string) {
    const payroll = await this.payrollService.findOne(+id);
    return payroll.allowance_options;
  }
}
