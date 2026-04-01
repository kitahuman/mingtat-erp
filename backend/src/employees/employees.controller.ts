import { Controller, Get, Post, Put, Param, Body, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { EmployeesService } from './employees.service';

@Controller('employees')
@UseGuards(AuthGuard('jwt'))
export class EmployeesController {
  constructor(private service: EmployeesService) {}

  @Get()
  findAll(@Query() query: any) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: number) {
    return this.service.findOne(+id);
  }

  @Post()
  create(@Body() dto: any) {
    return this.service.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: number, @Body() dto: any) {
    return this.service.update(+id, dto);
  }

  @Post(':id/terminate')
  terminate(@Param('id') id: number, @Body() dto: { termination_date: string; termination_reason?: string }) {
    return this.service.terminate(+id, dto);
  }

  @Post(':id/reinstate')
  reinstate(@Param('id') id: number) {
    return this.service.reinstate(+id);
  }

  @Post(':id/salary-settings')
  addSalarySetting(@Param('id') id: number, @Body() dto: any) {
    return this.service.addSalarySetting(+id, dto);
  }

  @Get(':id/salary-settings')
  getSalarySettings(@Param('id') id: number) {
    return this.service.getSalarySettings(+id);
  }

  @Post(':id/transfer')
  transferEmployee(@Param('id') id: number, @Body() dto: any) {
    return this.service.transferEmployee(+id, dto);
  }
}
