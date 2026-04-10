import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { EmployeesService } from './employees.service';

@Controller('employees')
@UseGuards(AuthGuard('jwt'))
export class EmployeesController {
  constructor(private service: EmployeesService) {}

  @Get()
  findAll(@Query() query: any) {
    return this.service.findAll(query);
  }

  @Get('filter-options/:column')
  getFilterOptions(@Param('column') column: string, @Query() query: any) {
    return this.service.getFilterOptions(column, query);
  }

  @Get(':id')
  findOne(@Param('id') id: number) {
    return this.service.findOne(+id);
  }

  @Post()
  create(@Body() dto: any) {
    return this.service.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: number, @Body() dto: any) {
    return this.service.update(+id, dto);
  }

  @Post(':id/terminate')
  terminate(@Param('id') id: number, @Body() dto: { termination_date: string; termination_reason?: string }) {
    return this.service.terminate(+id, dto);
  }

  @Post(':id/reinstate')
  reinstate(@Param('id') id: number) {
    return this.service.reinstate(+id);
  }

  @Post(':id/salary-settings')
  addSalarySetting(@Param('id') id: number, @Body() dto: any) {
    return this.service.addSalarySetting(+id, dto);
  }

  @Get(':id/salary-settings')
  getSalarySettings(@Param('id') id: number) {
    return this.service.getSalarySettings(+id);
  }

  @Post(':id/transfer')
  transferEmployee(@Param('id') id: number, @Body() dto: any) {
    return this.service.transferEmployee(+id, dto);
  }

  @Post(':id/convert-to-regular')
  convertToRegular(@Param('id') id: number, @Body() dto: any) {
    return this.service.convertToRegular(+id, dto);
  }

  @Get(':id/photo')
  getPhoto(@Param('id') id: number) {
    return this.service.getPhoto(+id);
  }

  @Put(':id/photo')
  updatePhoto(@Param('id') id: number, @Body() body: { photo_base64: string }) {
    return this.service.updatePhoto(+id, body.photo_base64);
  }

  @Delete(':id/photo')
  deletePhoto(@Param('id') id: number) {
    return this.service.deletePhoto(+id);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  remove(@Param('id') id: string) {
    return this.service.remove(Number(id));
  }

  /**
   * POST /employees/batch-delete
   * Batch delete employees by IDs.
   * Body: { ids: number[], type: 'inactive' | 'temporary' }
   */
  @Post('batch-delete')
  batchDelete(@Body() body: { ids: number[]; type?: 'inactive' | 'temporary' }) {
    return this.service.batchDelete(body.ids, body.type);
  }

  /**
   * POST /employees/mpf-bulk-dismiss
   * Mark employee_mpf_applied = true for all active, non-temporary employees
   * who joined more than 60 days ago but still have employee_mpf_applied = false.
   * This is a one-time cleanup endpoint; safe to call multiple times (idempotent).
   */
  @Post('mpf-bulk-dismiss')
  mpfBulkDismiss() {
    return this.service.mpfBulkDismiss();
  }

  // ── Nickname Management ──

  @Get(':id/nicknames')
  getNicknames(@Param('id') id: number) {
    return this.service.getNicknames(+id);
  }

  @Post(':id/nicknames')
  addNickname(@Param('id') id: number, @Body() dto: { nickname: string; source?: string }) {
    return this.service.addNickname(+id, dto.nickname, dto.source);
  }

  @Delete(':id/nicknames/:nicknameId')
  removeNickname(@Param('id') id: number, @Param('nicknameId') nicknameId: number) {
    return this.service.removeNickname(+id, +nicknameId);
  }

  // ── Nickname Search (for matching UI) ──

  @Get('search/by-nickname')
  searchByNickname(@Query('q') q: string) {
    return this.service.searchByNickname(q);
  }

}
