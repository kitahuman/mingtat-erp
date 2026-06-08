import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { AiKnowledgeService } from './ai-knowledge.service';
import { CreateKnowledgeEntryDto } from './dto/create-knowledge-entry.dto';
import { QueryActivityLogsDto } from './dto/query-activity-logs.dto';
import { QueryKnowledgeDto } from './dto/query-knowledge.dto';
import {
  RejectKnowledgeDto,
  ReviewKnowledgeDto,
} from './dto/review-knowledge.dto';
import { RetrieveKnowledgeDto } from './dto/retrieve-knowledge.dto';
import { UpdateKnowledgeEntryDto } from './dto/update-knowledge-entry.dto';
import { UpdateModulePolicyDto } from './dto/update-module-policy.dto';

interface JwtUser {
  id?: number;
  userId?: number;
  sub?: number | string;
}

interface AuthenticatedRequest extends Request {
  user?: JwtUser;
}

function getUserId(req: AuthenticatedRequest): number {
  const raw = req.user?.id ?? req.user?.userId ?? req.user?.sub;
  const parsed = typeof raw === 'number' ? raw : Number(raw);
  return Number.isInteger(parsed) ? parsed : 0;
}

@ApiTags('ai-knowledge')
@ApiBearerAuth('JWT-auth')
@Controller('ai-knowledge')
@UseGuards(AuthGuard('jwt'))
export class AiKnowledgeController {
  constructor(private readonly service: AiKnowledgeService) {}

  @Post('retrieve')
  @ApiOperation({ summary: '供 AI 模組查詢任務相關知識' })
  retrieve(@Body() dto: RetrieveKnowledgeDto) {
    return this.service.retrieve(dto);
  }

  @Get('entries')
  @ApiOperation({ summary: '管理介面列表查詢知識條目' })
  findAll(@Query() query: QueryKnowledgeDto) {
    return this.service.findAll(query);
  }

  @Get('activity-logs')
  @ApiOperation({ summary: '查詢 AI 活動歷史紀錄' })
  activityLogs(@Query() query: QueryActivityLogsDto) {
    return this.service.findActivityLogs(query);
  }

  @Post('migrate-existing-data')
  @ApiOperation({ summary: '匯入既有花名資料到 AI 知識庫' })
  migrateExistingData(@Req() req: AuthenticatedRequest) {
    return this.service.migrateExistingData(getUserId(req));
  }

  @Post('entries/batch-approve')
  @ApiOperation({ summary: '批量審核通過知識' })
  batchApprove(
    @Body() dto: { ids?: number[]; entryIds?: number[]; reason?: string },
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.batchApprove(
      dto.ids ?? dto.entryIds ?? [],
      dto.reason,
      getUserId(req),
    );
  }

  @Get('entries/:id')
  @ApiOperation({ summary: '查看知識詳情（含證據、版本、使用紀錄）' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post('entries')
  @ApiOperation({ summary: '手動新增知識' })
  create(
    @Body() dto: CreateKnowledgeEntryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.create(dto, getUserId(req));
  }

  @Patch('entries/:id')
  @ApiOperation({ summary: '編輯知識' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateKnowledgeEntryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.update(id, dto, getUserId(req));
  }

  @Post('entries/:id/approve')
  @ApiOperation({ summary: '審核通過知識' })
  approve(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewKnowledgeDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.approve(id, dto.reason, getUserId(req));
  }

  @Post('entries/:id/reject')
  @ApiOperation({ summary: '審核拒絕知識' })
  reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectKnowledgeDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.reject(id, dto.reason, getUserId(req));
  }

  @Post('entries/:id/enable')
  @ApiOperation({ summary: '啟用知識' })
  enable(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewKnowledgeDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.enable(id, dto.reason, getUserId(req));
  }

  @Post('entries/:id/disable')
  @ApiOperation({ summary: '停用知識' })
  disable(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewKnowledgeDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.disable(id, dto.reason, getUserId(req));
  }

  @Delete('entries/:id')
  @ApiOperation({ summary: '軟刪除知識' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.softDelete(id, getUserId(req));
  }

  @Get('entries/:id/usage-logs')
  @ApiOperation({ summary: '查看知識引用紀錄' })
  usageLogs(
    @Param('id', ParseIntPipe) id: number,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.usageLogs(
      id,
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 20,
    );
  }

  @Get('module-policies')
  @ApiOperation({ summary: '查看模組策略列表' })
  listPolicies() {
    return this.service.listPolicies();
  }

  @Patch('module-policies/:moduleCode')
  @ApiOperation({ summary: '更新模組知識策略' })
  @ApiParam({ name: 'moduleCode', example: 'ai-payroll' })
  updatePolicy(
    @Param('moduleCode') moduleCode: string,
    @Body() dto: UpdateModulePolicyDto,
  ) {
    return this.service.updatePolicy(moduleCode, dto);
  }
}
