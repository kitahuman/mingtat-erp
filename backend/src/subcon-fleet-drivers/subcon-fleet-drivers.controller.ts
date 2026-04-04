import { Controller, Get, Post, Put, Delete, Body, Query, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { SubconFleetDriversService } from './subcon-fleet-drivers.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('subcon-fleet-drivers')
@UseGuards(AuthGuard('jwt'))
export class SubconFleetDriversController {
  constructor(private readonly service: SubconFleetDriversService) {}

  @Get('simple')
  simple() {
    return this.service.simple();
  }

  @Get()
  findAll(@Query() query: any) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: any) {
    return this.service.create(dto);
  }

  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
