import { Controller, Post, Get, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { SubconPayrollService } from './subcon-payroll.service';
import { AuthGuard } from '@nestjs/passport';
import { ConfirmSubconPayrollDto } from './dto/confirm-subcon-payroll.dto';
import { SubconPayrollQueryDto } from './dto/subcon-payroll-query.dto';

@Controller('subcon-payroll')
@UseGuards(AuthGuard('jwt'))
export class SubconPayrollController {
  constructor(private readonly service: SubconPayrollService) {}

  @Post('preview')
  preview(@Body() dto: { subcon_id: number; date_from: string; date_to: string; company_id?: number }) {
    return this.service.preview(dto);
  }

  @Post('confirm')
  confirm(@Body() dto: ConfirmSubconPayrollDto) {
    return this.service.confirm(dto);
  }

  @Get('list')
  findAll(@Query() query: SubconPayrollQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(+id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(+id);
  }
}
