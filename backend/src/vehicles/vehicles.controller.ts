import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards , Request} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { VehiclesService } from './vehicles.service';

@Controller('vehicles')
@UseGuards(AuthGuard('jwt'))
export class VehiclesController {
  constructor(private service: VehiclesService) {}

  @Get('simple')
  simple() {
    return this.service.simple();
  }

  @Get()
  findAll(@Query() query: any) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: number) {
    return this.service.findOne(+id);
  }

  @Post()
  create(@Body() dto: any, @Request() req: any) {
    return this.service.create(dto, req.user?.id || req.user?.userId || 0, req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.ip || undefined);
  }

  @Put(':id')
  update(@Param('id') id: number, @Body() dto: any, @Request() req: any) {
    return this.service.update(+id, dto, req.user?.id || req.user?.userId || 0, req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.ip || undefined);
  }

  @Post(':id/change-plate')
  changePlate(@Param('id') id: number, @Body() dto: any, @Request() req: any) {
    return this.service.changePlate(+id, dto);
  }

  @Post(':id/transfer')
  transferVehicle(@Param('id') id: number, @Body() dto: any, @Request() req: any) {
    return this.service.transferVehicle(+id, dto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  remove(@Param('id') id: string, @Request() req: any) {
    return this.service.remove(Number(id), req.user?.id || req.user?.userId || 0, req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.ip || undefined);
  }

}