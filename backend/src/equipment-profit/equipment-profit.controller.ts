import {
  Controller,
  Get,
  Put,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { EquipmentProfitService } from './equipment-profit.service';
import {
  EquipmentProfitReportQueryDto,
  UpdateCommissionDto,
} from './dto/equipment-profit.dto';

@Controller('equipment-profit')
@UseGuards(AuthGuard('jwt'))
export class EquipmentProfitController {
  constructor(private readonly service: EquipmentProfitService) {}

  // GET /equipment-profit/report
  @Get('report')
  getReport(@Query() query: EquipmentProfitReportQueryDto) {
    return this.service.getReport({
      date_from: query.date_from,
      date_to: query.date_to,
      equipment_type: query.equipment_type,
      equipment_id: query.equipment_id,
    });
  }

  // GET /equipment-profit/report/:type/:id/details
  @Get('report/:type/:id/details')
  getDetails(
    @Param('type') type: string,
    @Param('id') id: string,
    @Query('date_from') dateFrom?: string,
    @Query('date_to') dateTo?: string,
  ) {
    return this.service.getDetails(type, +id, dateFrom, dateTo);
  }

  // GET /equipment-profit/settings
  @Get('settings')
  getSettings() {
    return this.service.getSettings();
  }

  // PUT /equipment-profit/settings/:equipmentType/:equipmentId
  @Put('settings/:equipmentType/:equipmentId')
  updateCommission(
    @Param('equipmentType') equipmentType: string,
    @Param('equipmentId') equipmentId: string,
    @Body() body: UpdateCommissionDto,
  ) {
    return this.service.updateCommission(
      equipmentType,
      +equipmentId,
      body.commission_percentage,
    );
  }
}
