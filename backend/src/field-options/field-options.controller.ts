import { Controller, Get, Post, Put, Delete, Param, Query, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FieldOptionsService } from './field-options.service';

@Controller('field-options')
@UseGuards(AuthGuard('jwt'))
export class FieldOptionsController {
  constructor(private readonly service: FieldOptionsService) {}

  @Get()
  findAllGrouped() {
    return this.service.findAllGrouped();
  }

  @Get('category/:category')
  findByCategory(@Param('category') category: string) {
    return this.service.findByCategory(category);
  }

  @Post()
  create(@Body() dto: { category: string; label: string; sort_order?: number }) {
    return this.service.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: number, @Body() dto: { label?: string; sort_order?: number; is_active?: boolean }) {
    return this.service.update(Number(id), dto);
  }

  @Delete(':id')
  remove(@Param('id') id: number) {
    return this.service.remove(Number(id));
  }

  @Post('reorder')
  reorder(@Body() dto: { category: string; orderedIds: number[] }) {
    return this.service.reorder(dto.category, dto.orderedIds);
  }

  @Post('merge-locations')
  mergeLocations(@Body() dto: { primaryId: number; mergeIds: number[] }) {
    return this.service.mergeLocations(dto);
  }

  @Post('bulk-import')
  bulkImport(@Body() dto: { category: string; labels: string[] }) {
    return this.service.bulkImport(dto.category, dto.labels);
  }

  @Put(':id/aliases')
  updateAliases(@Param('id') id: number, @Body() dto: { aliases: string[] }) {
    return this.service.updateAliases(Number(id), dto.aliases);
  }

  @Put(':id/gps')
  updateGps(
    @Param('id') id: number,
    @Body() dto: { field_option_latitude: number; field_option_longitude: number },
  ) {
    return this.service.updateGps(Number(id), dto);
  }

  @Get('locations/with-gps')
  getLocationsWithGps() {
    return this.service.getLocationsWithGps();
  }
}
