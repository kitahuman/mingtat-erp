import { Controller, Get, Put, Post, Delete, Param, Body, Query, ParseIntPipe, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AttendancesService } from './attendances.service';
import { AttendanceMatchingService } from './attendance-matching.service';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';
import {
  AnomalyQueryDto,
  ResolveAnomalyDto,
  ScanAnomaliesDto,
} from './dto/attendance-matching.dto';

@Controller('attendances')
@UseGuards(AuthGuard('jwt'))
export class AttendancesController {
  constructor(
    private readonly service: AttendancesService,
    private readonly matchingService: AttendanceMatchingService,
  ) {}

  @Get()
  findAll(@Query() query: Record<string, string | number | undefined>) {
    return this.service.findAll(query);
  }

  @Get('filter-options/:column')
  getFilterOptions(
    @Param('column') column: string,
    @Query() query: Record<string, string | number | undefined>,
  ) {
    return this.service.getFilterOptions(column, query);
  }

  @Get('match-detail/:workLogId')
  getMatchDetail(@Param('workLogId', ParseIntPipe) workLogId: number) {
    return this.matchingService.getMatchDetail(workLogId);
  }

  @Get('employee-day/:employeeId/:date')
  searchEmployeeAttendances(
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('date') date: string,
  ) {
    return this.matchingService.searchEmployeeAttendances(employeeId, date);
  }

  // ── 異常記錄 ──────────────────────────────────────────────

  @Get('anomalies')
  findAnomalies(@Query() query: AnomalyQueryDto) {
    return this.matchingService.findAnomalies(query);
  }

  @Post('anomalies/scan')
  scanAnomalies(@Body() dto: ScanAnomaliesDto) {
    return this.matchingService.scanAnomalies(dto.date_from, dto.date_to);
  }

  @Post('anomalies/:id/resolve')
  resolveAnomaly(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResolveAnomalyDto,
    @Req() req: any,
  ) {
    const userId = req.user?.id || req.user?.userId;
    return this.matchingService.resolveAnomaly(id, userId, dto.anomaly_resolved_notes);
  }

  @Post('anomalies/:id/unresolve')
  unresolveAnomaly(@Param('id', ParseIntPipe) id: number) {
    return this.matchingService.unresolveAnomaly(id);
  }

  // ── 基本 CRUD ──────────────────────────────────────────────

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAttendanceDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
