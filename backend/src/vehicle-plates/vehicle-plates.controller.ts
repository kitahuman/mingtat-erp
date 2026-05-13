import { Body, Controller, Get, Param, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AssignVehiclePlateDto, CreateVehiclePlateDto, ManualPlateAssignmentHistoryDto, ManualPlateTransferHistoryDto, TransferVehiclePlateDto, UpdateVehiclePlateDto } from './dto/vehicle-plate.dto';
import { VehiclePlatesService } from './vehicle-plates.service';

@Controller('vehicle-plates')
@UseGuards(AuthGuard('jwt'))
export class VehiclePlatesController {
  constructor(private service: VehiclePlatesService) {}

  @Get()
  findAll(@Query() query: any) {
    return this.service.findAll(query);
  }

  @Post()
  create(@Body() dto: CreateVehiclePlateDto, @Request() req: any) {
    return this.service.create(dto, req.user?.id || req.user?.userId || 0, req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.ip || undefined);
  }

  @Get('filter-options/:column')
  getFilterOptions(@Param('column') column: string, @Query() query: any) {
    return this.service.getFilterOptions(column, query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(Number(id));
  }

  @Post(':id/assign')
  assign(@Param('id') id: string, @Body() dto: AssignVehiclePlateDto, @Request() req: any) {
    return this.service.assign(Number(id), dto, req.user?.id || req.user?.userId || 0, req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.ip || undefined);
  }

  @Post(':id/transfer')
  transfer(@Param('id') id: string, @Body() dto: TransferVehiclePlateDto, @Request() req: any) {
    return this.service.transfer(Number(id), dto, req.user?.id || req.user?.userId || 0, req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.ip || undefined);
  }

  @Post(':id/history/assignment')
  addAssignmentHistory(@Param('id') id: string, @Body() dto: ManualPlateAssignmentHistoryDto) {
    return this.service.addAssignmentHistory(Number(id), dto);
  }

  @Post(':id/history/transfer')
  addTransferHistory(@Param('id') id: string, @Body() dto: ManualPlateTransferHistoryDto) {
    return this.service.addTransferHistory(Number(id), dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateVehiclePlateDto, @Request() req: any) {
    return this.service.update(Number(id), dto, req.user?.id || req.user?.userId || 0, req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.ip || undefined);
  }
}
