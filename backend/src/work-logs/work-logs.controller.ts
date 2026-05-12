import {
  Controller, Get, Post, Put, Delete, Patch,
  Param, Query, Body, UseGuards, Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SkipThrottle } from '@nestjs/throttler';
import { WorkLogsService } from './work-logs.service';
import { CreateWorkLogDto, UpdateWorkLogDto } from './dto/create-work-log.dto';
import { UnmatchedCombinationsQueryDto, AddRateAndRematchDto } from './dto/unmatched-combinations.dto';
import { WorkLogPivotQueryDto } from './dto/work-log-pivot.dto';

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

  @SkipThrottle()
  @Get('filter-options/:column')
  getFilterOptions(@Param('column') column: string, @Query() query: any) {
    return this.service.getFilterOptions(column, query);
  }

  // ── 缺單價組合 ─────────────────────────────────────────────

  @Get('unmatched-combinations')
  getUnmatchedCombinations(@Query() query: UnmatchedCombinationsQueryDto) {
    return this.service.getUnmatchedCombinations(query);
  }

  @Get('unmatched-combinations/filter-options/:column')
  getUnmatchedFilterOptions(@Param('column') column: string) {
    return this.service.getUnmatchedFilterOptions(column);
  }

  @Post('add-rate-and-rematch')
  addRateAndRematch(@Body() dto: AddRateAndRematchDto) {
    return this.service.addRateAndRematch(dto);
  }

  // ── 整理分析 Pivot Table ─────────────────────────────────────

  @Get('pivot')
  getPivot(@Query() query: WorkLogPivotQueryDto) {
    return this.service.getPivot(query);
  }

  @Get('pivot/summary')
  getPivotSummary(@Query() query: WorkLogPivotQueryDto) {
    return this.service.getPivotSummary(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(Number(id));
  }

  // ── 建立 & 更新 ──────────────────────────────────────────

  @Post()
  create(@Body() dto: CreateWorkLogDto, @Request() req: any) {
    return this.service.create(dto, req.user.id, req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.ip || undefined);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateWorkLogDto, @Request() req: any) {
    return this.service.update(Number(id), dto, req.user?.id || req.user?.userId || 0);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.service.remove(Number(id), req.user?.id || req.user?.userId || 0, req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.ip || undefined);
  }

  // ── 批量操作 ─────────────────────────────────────────────

  @Post('bulk/delete')
  bulkDelete(@Body('ids') ids: number[]) {
    return this.service.bulkDelete(ids);
  }

  @Post('bulk/update')
  bulkUpdate(@Body() body: { ids: number[]; field: string; value: any }, @Request() req: any) {
    return this.service.bulkUpdate(body.ids, body.field, body.value, req.user?.id || req.user?.userId || 0);
  }

  @Post('bulk/confirm')
  bulkConfirm(@Body('ids') ids: number[], @Request() req: any) {
    return this.service.bulkConfirm(ids, req.user?.id || req.user?.userId || 0);
  }

  @Post('bulk/unconfirm')
  bulkUnconfirm(@Body('ids') ids: number[], @Request() req: any) {
    return this.service.bulkUnconfirm(ids, req.user?.id || req.user?.userId || 0);
  }

  // ── 批量儲存 (Airtable 風格) ───────────────────────────────────

  @Post('bulk/save')
  bulkSave(@Body('changes') changes: Array<{ id: number; data: any }>, @Request() req: any) {
    return this.service.bulkSave(changes, req.user?.id || req.user?.userId || 0);
  }

  // ── 編輯鎖定 ─────────────────────────────────────

  @Post('edit-lock/acquire')
  acquireEditLock(@Body() body: { lockKey: string }, @Request() req: any) {
    return this.service.acquireEditLock(
      body.lockKey,
      req.user.id,
      req.user.displayName || req.user.username,
    );
  }

  @Post('edit-lock/heartbeat')
  heartbeatEditLock(@Body() body: { lockKey: string }, @Request() req: any) {
    return this.service.heartbeatEditLock(body.lockKey, req.user.id);
  }

  @Post('edit-lock/release')
  releaseEditLock(@Body() body: { lockKey: string }, @Request() req: any) {
    return this.service.releaseEditLock(body.lockKey, req.user.id);
  }

  @Get('edit-lock/status')
  getEditLockStatus(@Query('lockKey') lockKey: string, @Request() req: any) {
    return this.service.getEditLockStatus(lockKey, req.user.id);
  }

   // ── 確認地點（WhatsApp 打卡黃色 Highlight 消除）───────────

  @Post(':id/confirm-location')
  confirmLocation(@Param('id') id: string) {
    return this.service.confirmLocation(Number(id));
  }

  // ── 複製 ───────────────────────────────────────

  @Post(':id/duplicate')
  duplicate(@Param('id') id: string, @Request() req: any) {
    return this.service.duplicate(Number(id), req.user.id);
  }
}