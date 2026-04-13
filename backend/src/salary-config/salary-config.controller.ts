import { Controller, Get, Post, Put, Delete, Param, Query, Body, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SalaryConfigService } from './salary-config.service';

@Controller('salary-config')
@UseGuards(AuthGuard('jwt'))
export class SalaryConfigController {
  constructor(private readonly service: SalaryConfigService) {}

  @Get()
  findAll(@Query() query: any) {
    return this.service.findAll(query);
  }

  @Get('employee/:employeeId')
  findByEmployee(@Param('employeeId') employeeId: number) {
    return this.service.findByEmployee(Number(employeeId));
  }

  @Get(':id')
  findOne(@Param('id') id: number) {
    return this.service.findOne(Number(id));
  }

  @Post()
  create(@Body() dto: any, @Request() req: any) {
    return this.service.create(dto, req.user?.id || req.user?.userId || 0, req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.ip || undefined);
  }

  @Put(':id')
  update(@Param('id') id: number, @Body() dto: any, @Request() req: any) {
    return this.service.update(Number(id), dto, req.user?.id || req.user?.userId || 0);
  }

  @Delete(':id')
  delete(@Param('id') id: number, @Request() req: any) {
    return this.service.delete(Number(id), req.user?.id || req.user?.userId || 0, req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.ip || undefined);
  }
}
