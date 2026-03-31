import { Controller, Get, Post, Put, Param, Query, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SubconRateCardsService } from './subcon-rate-cards.service';

@Controller('subcon-rate-cards')
@UseGuards(AuthGuard('jwt'))
export class SubconRateCardsController {
  constructor(private readonly service: SubconRateCardsService) {}

  @Get()
  findAll(@Query() query: any) {
    return this.service.findAll(query);
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
}
