import { Controller, Get, Post, Put, Delete, Param, Query, Body, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FleetRateCardsService } from './fleet-rate-cards.service';

@Controller('fleet-rate-cards')
@UseGuards(AuthGuard('jwt'))
export class FleetRateCardsController {
  constructor(private readonly service: FleetRateCardsService) {}

  @Get()
  findAll(@Query() query: any) {
    return this.service.findAll(query);
  }

  @Get('linked/:rateCardId')
  findLinked(@Param('rateCardId') rateCardId: string) {
    return this.service.findOrCreateLinked(Number(rateCardId));
  }

  @Get(':id')
  findOne(@Param('id') id: number) {
    return this.service.findOne(Number(id));
  }

  @Post()
  create(@Body() dto: any, @Request() req: any) {
    return this.service.create(dto, req.user?.id, req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.ip || undefined);
  }

  @Put(':id')
  update(@Param('id') id: number, @Body() dto: any, @Request() req: any) {
    return this.service.update(Number(id), dto, req.user?.id);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  remove(@Param('id') id: string, @Request() req: any) {
    return this.service.remove(Number(id), req.user?.id, req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.ip || undefined);
  }

}
