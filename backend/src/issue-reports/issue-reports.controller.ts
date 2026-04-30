import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IssueReportsService } from './issue-reports.service';
import { CreateIssueReportDto } from './issue-reports.dto';

@Controller('issue-reports')
@UseGuards(AuthGuard('jwt'))
export class IssueReportsController {
  constructor(private readonly service: IssueReportsService) {}

  @Post()
  create(@Body() dto: CreateIssueReportDto, @Req() req: any) {
    return this.service.create(dto, req.user || {});
  }

  @Get()
  findAll(@Req() req: any, @Query('limit') limit?: string) {
    const n = limit ? Number(limit) : 50;
    return this.service.findAll(req.user || {}, Number.isFinite(n) ? n : 50);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.service.findOne(id, req.user || {});
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: 'open' | 'acknowledged' | 'resolved',
  ) {
    return this.service.updateStatus(id, status);
  }
}
