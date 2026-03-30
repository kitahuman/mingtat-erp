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
