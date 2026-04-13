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
    return this.service.create(dto, req.user.id, req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.ip || undefined);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
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
  bulkUpdate(@Body() body: { ids: number[]; field: string; value: any }) {
    return this.service.bulkUpdate(body.ids, body.field, body.value);
  }

  @Post('bulk/confirm')
  bulkConfirm(@Body('ids') ids: number[]) {
    return this.service.bulkConfirm(ids);
  }

  @Post('bulk/unconfirm')
  bulkUnconfirm(@Body('ids') ids: number[]) {
    return this.service.bulkUnconfirm(ids);
  }

  // ── 批量儲存 (Airtable 風格) ───────────────────────────────────

  @Post('bulk/save')
  bulkSave(@Body('changes') changes: Array<{ id: number; data: any }>) {
    return this.service.bulkSave(changes);
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
    return this.service.heartbeatEditLock(body.lockKey, req.user.id, req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.ip || undefined);
  }

  @Post('edit-lock/release')
  releaseEditLock(@Body() body: { lockKey: string }, @Request() req: any) {
    return this.service.releaseEditLock(body.lockKey, req.user.id, req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.ip || undefined);
  }

  @Get('edit-lock/status')
  getEditLockStatus(@Query('lockKey') lockKey: string, @Request() req: any) {
    return this.service.getEditLockStatus(lockKey, req.user.id, req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.ip || undefined);
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