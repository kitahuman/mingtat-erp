import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuditLogsService } from './audit-logs.service';

@Controller('audit-logs')
@UseGuards(AuthGuard('jwt'))
export class AuditLogsController {
  constructor(private service: AuditLogsService) {}

  @Get()
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @Query('targetTable') targetTable?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.service.findAll({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      userId: userId ? Number(userId) : undefined,
      action,
      targetTable,
      dateFrom,
      dateTo,
    });
  }

  @Get(':id')
  async findOne(@Query('id') id: string) {
    return this.service.findOne(Number(id));
  }

  @Get('record/:targetTable/:targetId')
  async findByTargetRecord(
    @Query('targetTable') targetTable: string,
    @Query('targetId') targetId: string,
  ) {
    return this.service.findByTargetRecord(targetTable, Number(targetId));
  }
}
