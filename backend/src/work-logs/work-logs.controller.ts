import {
  Controller, Get, Post, Put, Delete, Patch,
  Param, Query, Body, UseGuards, Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { WorkLogsService } from './work-logs.service';

@Controller('work-logs')
@UseGuards(AuthGuard('jwt'))
export class WorkLogsController {
  constructor(private readonly service: WorkLogsService) {}

  // ── 列表 & 詳情 ──────────────────────────────────────────

  @Get()
  findAll(@Query() query: any) {
    return this.service.findAll(query);
  }

  @Get('location-suggestions')
  getLocationSuggestions(
    @Query('type') type: 'start' | 'end',
    @Query('q') q: string,
  ) {
    return this.service.getLocationSuggestions(type || 'start', q || '');
  }

  @Get('equipment-options')
  getEquipmentOptions(
    @Query('machine_type') machineType: string,
    @Query('tonnage') tonnage?: string,
  ) {
    return this.service.getEquipmentOptions(machineType, tonnage);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(Number(id));
  }

  // ── 建立 & 更新 ──────────────────────────────────────────

  @Post()
  create(@Body() dto: any, @Request() req: any) {
    return this.service.create(dto, req.user.id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: any) {
    return this.service.update(Number(id), dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(Number(id));
  }

  // ── 批量操作 ─────────────────────────────────────────────

  @Post('bulk/delete')
  bulkDelete(@Body('ids') ids: number[]) {
    return this.service.bulkDelete(ids);
  }

  @Post('bulk/confirm')
  bulkConfirm(@Body('ids') ids: number[]) {
    return this.service.bulkConfirm(ids);
  }

  @Post('bulk/unconfirm')
  bulkUnconfirm(@Body('ids') ids: number[]) {
    return this.service.bulkUnconfirm(ids);
  }

  // ── 複製 ─────────────────────────────────────────────────

  @Post(':id/duplicate')
  duplicate(@Param('id') id: string, @Request() req: any) {
    return this.service.duplicate(Number(id), req.user.id);
  }
}
