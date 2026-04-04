import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { SubconPayrollService } from './subcon-payroll.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('subcon-payroll')
@UseGuards(AuthGuard('jwt'))
export class SubconPayrollController {
  constructor(private readonly service: SubconPayrollService) {}

  @Post('preview')
  preview(@Body() dto: { subcon_id: number; date_from: string; date_to: string; company_id?: number }) {
    return this.service.preview(dto);
  }
}
