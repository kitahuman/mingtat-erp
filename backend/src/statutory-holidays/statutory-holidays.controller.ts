import { Controller, Get, Post, Put, Delete, Param, Query, Body, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { StatutoryHolidaysService } from './statutory-holidays.service';

@Controller('statutory-holidays')
@UseGuards(AuthGuard('jwt'))
export class StatutoryHolidaysController {
  constructor(private readonly service: StatutoryHolidaysService) {}

  @Get()
  findAll(@Query('year') year?: string) {
    return this.service.findAll({ year: year ? Number(year) : undefined });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(Number(id));
  }

  @Post()
  create(@Body() dto: { date: string; name: string }, @Request() req: any) {
    return this.service.create(dto, req.user?.id || req.user?.userId || 0);
  }

  @Post('bulk')
  bulkCreate(@Body() dto: { items: { date: string; name: string }[] }) {
    return this.service.bulkCreate(dto.items);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: { date?: string; name?: string }, @Request() req: any) {
    return this.service.update(Number(id), dto, req.user?.id || req.user?.userId || 0);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.service.remove(Number(id), req.user?.id || req.user?.userId || 0);
  }
}
