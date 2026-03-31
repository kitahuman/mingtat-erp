import {
  Controller, Get, Post, Put, Delete,
  Param, Query, Body,
  UseGuards,
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
  }) {
    return this.payrollService.preview(body);
  }

  // 生成糧單（單一員工 + 日期範圍）
  @Post('generate')
  generate(@Body() body: {
    employee_id: number;
    date_from: string;
    date_to: string;
    company_profile_id?: number;
    period?: string;
  }) {
    return this.payrollService.generate(body);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.payrollService.update(+id, body);
  }

  @Post('bulk/confirm')
  bulkConfirm(@Body() body: { ids: number[] }) {
    return this.payrollService.bulkConfirm(body.ids);
  }

  @Post('bulk/mark-paid')
  bulkMarkPaid(@Body() body: { ids: number[]; payment_date?: string; cheque_number?: string }) {
    return this.payrollService.bulkMarkPaid(body.ids, body.payment_date, body.cheque_number);
  }

  @Post(':id/recalculate')
  recalculate(@Param('id') id: string) {
    return this.payrollService.recalculate(+id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.payrollService.remove(+id);
  }
}
