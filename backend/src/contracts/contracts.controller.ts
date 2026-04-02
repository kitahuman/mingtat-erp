import { Controller, Get, Post, Put, Delete, Param, Query, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ContractsService } from './contracts.service';

@Controller('contracts')
@UseGuards(AuthGuard('jwt'))
export class ContractsController {
  constructor(private readonly service: ContractsService) {}

  @Get()
  findAll(@Query() query: any) {
    return this.service.findAll(query);
  }

  @Get('simple')
  findSimple() {
    return this.service.findSimple();
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
  remove(@Param('id') id: number) {
    return this.service.remove(Number(id));
  }
}
