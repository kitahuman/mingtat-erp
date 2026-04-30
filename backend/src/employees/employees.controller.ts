import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards , Request} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto, UpdateEmployeeDto, TransferEmployeeDto, ConvertToRegularDto, AddSalarySettingDto } from './dto/create-employee.dto';
import { MergeEmployeeDto } from './dto/merge-employee.dto';

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
  create(@Body() dto: CreateEmployeeDto, @Request() req: any) {
    return this.service.create(dto, req.user?.id || req.user?.userId || 0, req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.ip || undefined);
  }

  @Put(':id')
  update(@Param('id') id: number, @Body() dto: UpdateEmployeeDto, @Request() req: any) {
    return this.service.update(+id, dto, req.user?.id || req.user?.userId || 0, req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.ip || undefined);
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
  addSalarySetting(@Param('id') id: number, @Body() dto: AddSalarySettingDto, @Request() req: any) {
    return this.service.addSalarySetting(+id, dto);
  }

  @Get(':id/salary-settings')
  getSalarySettings(@Param('id') id: number) {
    return this.service.getSalarySettings(+id);
  }

  @Post(':id/transfer')
  transferEmployee(@Param('id') id: number, @Body() dto: TransferEmployeeDto, @Request() req: any) {
    return this.service.transferEmployee(+id, dto);
  }

  @Post(':id/convert-to-regular')
  convertToRegular(@Param('id') id: number, @Body() dto: ConvertToRegularDto, @Request() req: any) {
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
  remove(@Param('id') id: string, @Request() req: any) {
    return this.service.remove(Number(id), req.user?.id || req.user?.userId || 0, req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.ip || undefined);
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

  // ── Emp Code Utilities ──

  /**
   * GET /employees/next-emp-code
   * Returns the next available emp_code for preview in the convert-to-regular form.
   */
  @Get('next-emp-code')
  getNextEmpCode() {
    return this.service.getNextEmpCodePublic();
  }

  /**
   * POST /employees/backfill-emp-codes
   * Backfill emp_code for regular employees that are missing one.
   */
  @Post('backfill-emp-codes')
  backfillMissingEmpCodes() {
    return this.service.backfillMissingEmpCodes();
  }

  // ── Temporary Employee Merge ──

  /**
   * GET /employees/:id/check-merge?target_employee_id=xxx
   * Returns a preview of records that will be transferred from source (temporary) to target (regular).
   */
  @Get(':id/check-merge')
  checkMerge(
    @Param('id') id: string,
    @Query('target_employee_id') targetId: string,
  ) {
    return this.service.checkMerge(Number(id), Number(targetId));
  }

  /**
   * POST /employees/:id/merge
   * Execute the merge: transfer all records from source (temporary) to target (regular), then delete source.
   * Body: { target_employee_id: number }
   */
  @Post(':id/merge')
  mergeEmployee(
    @Param('id') id: string,
    @Body() dto: MergeEmployeeDto,
    @Request() req: any,
  ) {
    return this.service.mergeEmployee(
      Number(id),
      dto.target_employee_id,
      dto.force_overwrite_salary,
      req.user?.id || req.user?.userId || 0,
      req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.ip || undefined,
    );
  }
}
