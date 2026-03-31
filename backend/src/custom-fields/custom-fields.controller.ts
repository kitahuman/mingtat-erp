import { Controller, Get, Post, Put, Delete, Param, Query, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CustomFieldsService } from './custom-fields.service';

@Controller('custom-fields')
@UseGuards(AuthGuard('jwt'))
export class CustomFieldsController {
  constructor(private readonly service: CustomFieldsService) {}

  // ========== Field Definitions ==========

  @Get()
  findFields(@Query() query: any) {
    return this.service.findFields(query);
  }

  @Get('expiry-alerts')
  expiryAlerts() {
    return this.service.getExpiryAlerts();
  }

  @Get(':id')
  findOneField(@Param('id') id: number) {
    return this.service.findOneField(Number(id));
  }

  @Post()
  createField(@Body() dto: any) {
    return this.service.createField(dto);
  }

  @Put(':id')
  updateField(@Param('id') id: number, @Body() dto: any) {
    return this.service.updateField(Number(id), dto);
  }

  @Delete(':id')
  deleteField(@Param('id') id: number) {
    return this.service.deleteField(Number(id));
  }

  // ========== Field Values ==========

  @Get('values/list')
  findValues(@Query() query: any) {
    return this.service.findValues({
      module: query.module,
      entityId: query.entityId ? Number(query.entityId) : undefined,
      customFieldId: query.customFieldId ? Number(query.customFieldId) : undefined,
    });
  }

  @Put('values/batch')
  batchUpdateValues(@Body() data: any) {
    return this.service.batchUpdateValues(data);
  }
}
