import { Controller, Get, Post, Put, Delete, Body, Query, Param, ParseIntPipe, UseGuards, Request } from '@nestjs/common';
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

  @Get('simple-drivers')
  simpleDrivers() {
    return this.service.simpleDrivers();
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
  create(@Body() dto: any, @Request() req: any) {
    return this.service.create(dto, req.user?.id || req.user?.userId || 0, req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.ip || undefined);
  }

  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: any, @Request() req: any) {
    return this.service.update(id, dto, req.user?.id || req.user?.userId || 0, req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.ip || undefined);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.service.remove(id, req.user?.id || req.user?.userId || 0, req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.ip || undefined);
  }
}
