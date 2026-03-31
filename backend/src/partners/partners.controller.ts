import { Controller, Get, Post, Put, Param, Query, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PartnersService } from './partners.service';

@Controller('partners')
@UseGuards(AuthGuard('jwt'))
export class PartnersController {
  constructor(private readonly service: PartnersService) {}

  @Get()
  findAll(@Query() query: any) {
    return this.service.findAll(query);
  }

  @Get('simple')
  simple() {
    return this.service.simple();
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
