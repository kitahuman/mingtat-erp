import { Controller, Get, Post, Put, Patch, Delete, Param, Query, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { QuotationsService } from './quotations.service';

@Controller('quotations')
@UseGuards(AuthGuard('jwt'))
export class QuotationsController {
  constructor(private readonly service: QuotationsService) {}

  @Get()
  findAll(@Query() query: any) {
    return this.service.findAll(query);
  }

  @Get('by-project/:projectId')
  findByProject(@Param('projectId') projectId: number) {
    return this.service.findByProject(Number(projectId));
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

  @Patch(':id/status')
  updateStatus(@Param('id') id: number, @Body('status') status: string) {
    return this.service.updateStatus(Number(id), status);
  }

  @Post(':id/accept')
  acceptQuotation(@Param('id') id: number, @Body() options: any) {
    return this.service.acceptQuotation(Number(id), options);
  }

  @Post(':id/sync-to-rate-cards')
  syncToRateCards(@Param('id') id: number, @Body() options: any) {
    return this.service.syncToRateCards(Number(id), options);
  }

  @Delete(':id')
  remove(@Param('id') id: number) {
    return this.service.remove(Number(id));
  }
}
