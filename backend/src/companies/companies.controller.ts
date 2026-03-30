import { Controller, Get, Post, Put, Param, Body, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CompaniesService } from './companies.service';

@Controller('companies')
@UseGuards(AuthGuard('jwt'))
export class CompaniesController {
  constructor(private service: CompaniesService) {}

  @Get()
  findAll(@Query() query: any) {
    return this.service.findAll(query);
  }

  @Get('simple')
  findAllSimple() {
    return this.service.findAllSimple();
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
}
