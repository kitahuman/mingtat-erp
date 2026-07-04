import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ProjectCostRatesService } from './project-cost-rates.service';
import {
  BatchUpsertProjectCostRatesDto,
  UpdateProjectCostRateDto,
} from './dto/project-cost-rate.dto';

@Controller('projects/:id')
@UseGuards(AuthGuard('jwt'))
export class ProjectCostRatesController {
  constructor(private readonly service: ProjectCostRatesService) {}

  // ── Cost rates CRUD ──
  @Get('cost-rates')
  findAll(@Param('id', ParseIntPipe) id: number) {
    return this.service.findAll(id);
  }

  @Post('cost-rates')
  batchUpsert(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: BatchUpsertProjectCostRatesDto,
  ) {
    return this.service.batchUpsert(id, dto.rates);
  }

  @Put('cost-rates/:rateId')
  updateOne(
    @Param('id', ParseIntPipe) id: number,
    @Param('rateId', ParseIntPipe) rateId: number,
    @Body() dto: UpdateProjectCostRateDto,
  ) {
    return this.service.updateOne(id, rateId, dto);
  }

  @Delete('cost-rates/:rateId')
  removeOne(
    @Param('id', ParseIntPipe) id: number,
    @Param('rateId', ParseIntPipe) rateId: number,
  ) {
    return this.service.removeOne(id, rateId);
  }

  // ── Settlement summary (結算匯總) ──
  @Get('settlement-summary')
  getSettlementSummary(@Param('id', ParseIntPipe) id: number) {
    return this.service.getSettlementSummary(id);
  }

  // ── Financial statement (財務報表) ──
  @Get('financial-statement')
  getFinancialStatement(@Param('id', ParseIntPipe) id: number) {
    return this.service.getFinancialStatement(id);
  }
}
