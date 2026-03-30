import { Controller, Get, Post, Put, Param, Body, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { VehiclesService } from './vehicles.service';

@Controller('vehicles')
@UseGuards(AuthGuard('jwt'))
export class VehiclesController {
  constructor(private service: VehiclesService) {}

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

  @Post(':id/change-plate')
  changePlate(@Param('id') id: number, @Body() dto: any) {
    return this.service.changePlate(+id, dto);
  }

  @Post(':id/transfer')
  transferVehicle(@Param('id') id: number, @Body() dto: any) {
    return this.service.transferVehicle(+id, dto);
  }
}
