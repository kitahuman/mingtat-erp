import { Controller, Get, Post, Put, Delete, Param, Query, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FieldOptionsService } from './field-options.service';
import { MergeContractOptionsDto } from './dto/merge-contract-options.dto';
import {
  BulkImportFieldOptionsDto,
  CreateFieldOptionDto,
  FindDuplicateLocationsQueryDto,
  LocationOptionsQueryDto,
  MergeLocationsDto,
  ReorderFieldOptionsDto,
  UpdateAliasesDto,
  UpdateFieldOptionDto,
  UpdateGpsDto,
} from './dto/field-options.dto';

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
  create(@Body() dto: CreateFieldOptionDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: number, @Body() dto: UpdateFieldOptionDto) {
    return this.service.update(Number(id), dto);
  }

  @Delete(':id')
  remove(@Param('id') id: number) {
    return this.service.remove(Number(id));
  }

  @Post('reorder')
  reorder(@Body() dto: ReorderFieldOptionsDto) {
    return this.service.reorder(dto.category, dto.orderedIds);
  }

  @Get('locations/with-usage')
  getLocationsWithUsage(@Query() query: LocationOptionsQueryDto) {
    return this.service.getLocationsWithUsage(query);
  }

  @Get('locations/duplicates')
  findDuplicateLocations(@Query() query: FindDuplicateLocationsQueryDto) {
    return this.service.findDuplicateLocations(query);
  }

  @Post('merge-locations')
  mergeLocations(@Body() dto: MergeLocationsDto) {
    return this.service.mergeLocations(dto);
  }

  @Post('merge-contract-options')
  mergeContractOptions(@Body() dto: MergeContractOptionsDto) {
    return this.service.mergeContractOptions(dto);
  }

  @Post('bulk-import')
  bulkImport(@Body() dto: BulkImportFieldOptionsDto) {
    return this.service.bulkImport(dto.category, dto.labels);
  }

  @Put(':id/aliases')
  updateAliases(@Param('id') id: number, @Body() dto: UpdateAliasesDto) {
    return this.service.updateAliases(Number(id), dto.aliases);
  }

  @Put(':id/gps')
  updateGps(
    @Param('id') id: number,
    @Body() dto: UpdateGpsDto,
  ) {
    return this.service.updateGps(Number(id), dto);
  }

  @Get('locations/with-gps')
  getLocationsWithGps() {
    return this.service.getLocationsWithGps();
  }
}
