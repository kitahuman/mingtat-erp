import { Controller, Get, Post, Put, Param, Query, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CompanyProfilesService } from './company-profiles.service';
import { CreateCompanyProfileDto, UpdateCompanyProfileDto } from './dto/create-company-profile.dto';

@Controller('company-profiles')
@UseGuards(AuthGuard('jwt'))
export class CompanyProfilesController {
  constructor(private readonly service: CompanyProfilesService) {}

  @Get()
  findAll(@Query() query: any) {
    return this.service.findAll(query);
  }

  @Get('simple')
  simple() {
    return this.service.simple();
  }

  @Get('expiry-alerts')
  expiryAlerts() {
    return this.service.getExpiryAlerts();
  }

  @Get(':id')
  findOne(@Param('id') id: number) {
    return this.service.findOne(Number(id));
  }

  @Post()
  create(@Body() dto: CreateCompanyProfileDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: number, @Body() dto: UpdateCompanyProfileDto) {
    return this.service.update(Number(id), dto);
  }
}
