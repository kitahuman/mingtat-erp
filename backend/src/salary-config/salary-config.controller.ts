import { Controller, Get, Post, Put, Delete, Param, Query, Body, UseGuards } from '@nestjs/common';
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
  create(@Body() dto: any) {
    return this.service.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: number, @Body() dto: any) {
    return this.service.update(Number(id), dto);
  }

  @Delete(':id')
  delete(@Param('id') id: number) {
    return this.service.delete(Number(id));
  }
}
