import { Controller, Get, Post, Put, Delete, Param, Query, Body, UseGuards } from '@nestjs/common';
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
  create(@Body() dto: any) {
    return this.service.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: number, @Body() dto: any) {
    return this.service.update(Number(id), dto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  remove(@Param('id') id: string) {
    return this.service.remove(Number(id));
  }

}