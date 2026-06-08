import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { extname, join } from 'path';
import { diskStorage } from 'multer';
import { AiPayrollService } from './ai-payroll.service';
import { CreateAiPayrollBatchDto } from './dto/create-ai-payroll-batch.dto';
import { QueryPayrollBatchesDto } from './dto/query-payroll-batches.dto';
import { UploadPayrollDocumentDto } from './dto/upload-payroll-document.dto';
import { StartExtractionJobDto } from './dto/start-extraction-job.dto';
import { QueryPayrollEntriesDto } from './dto/query-payroll-entries.dto';
import { UpdateEntryFieldDto } from './dto/update-entry-field.dto';
import { MatchEmployeeDto } from './dto/match-employee.dto';
import { ExcludeEntryDto } from './dto/exclude-entry.dto';
import { ConfirmPageDto } from './dto/confirm-page.dto';

const UPLOAD_DIR = join(process.cwd(), 'uploads', 'ai-payroll', 'documents');

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

function getUploadDir(): string {
  if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });
  return UPLOAD_DIR;
}

@ApiTags('ai-payroll')
@ApiBearerAuth('JWT-auth')
@Controller('ai-payroll')
@UseGuards(AuthGuard('jwt'))
export class AiPayrollController {
  constructor(private readonly service: AiPayrollService) {}

  @Post('batches')
  @ApiOperation({ summary: '建立 AI 計糧批次' })
  createBatch(@Body() dto: CreateAiPayrollBatchDto, @Req() req: AuthenticatedRequest) {
    return this.service.createBatch(dto, getUserId(req));
  }

  @Get('batches')
  @ApiOperation({ summary: '查詢 AI 計糧批次列表' })
  listBatches(@Query() query: QueryPayrollBatchesDto) {
    return this.service.listBatches(query);
  }

  @Get('batches/:batchId')
  @ApiOperation({ summary: '取得批次詳情' })
  getBatch(@Param('batchId', ParseIntPipe) batchId: number) {
    return this.service.getBatch(batchId);
  }

  @Post('batches/:batchId/documents')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: (_req, _file, cb) => cb(null, getUploadDir()),
      filename: (_req, file, cb) => {
        const decodedName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        const ext = extname(decodedName || file.originalname);
        cb(null, `${randomUUID()}${ext}`);
      },
    }),
    limits: { fileSize: 100 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (!/^(application\/pdf|image\/(png|jpe?g|webp))$/i.test(file.mimetype)) {
        return cb(new BadRequestException('只支援 PDF、PNG、JPG、JPEG、WEBP 文件'), false);
      }
      cb(null, true);
    },
  }))
  @ApiOperation({ summary: '上傳 AI 計糧照片或 PDF' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadPayrollDocumentDto })
  uploadDocument(
    @Param('batchId', ParseIntPipe) batchId: number,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadPayrollDocumentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.uploadDocument(batchId, file, dto, getUserId(req));
  }

  @Get('batches/:batchId/documents')
  @ApiOperation({ summary: '查看批次上傳文件' })
  listDocuments(@Param('batchId', ParseIntPipe) batchId: number) {
    return this.service.listDocuments(batchId);
  }

  @Get('batches/:batchId/pages')
  @ApiOperation({ summary: '查看批次頁面列表' })
  listPages(@Param('batchId', ParseIntPipe) batchId: number) {
    return this.service.listPages(batchId);
  }

  @Post('batches/:batchId/extraction-jobs')
  @ApiOperation({ summary: '開始 AI 識別' })
  startExtractionJob(@Param('batchId', ParseIntPipe) batchId: number, @Body() dto: StartExtractionJobDto) {
    return this.service.startExtractionJob(batchId, dto);
  }

  @Get('extraction-jobs/:jobId')
  @ApiOperation({ summary: '查詢 AI 識別進度' })
  getExtractionJob(@Param('jobId') jobId: string) {
    return this.service.getExtractionJob(jobId);
  }

  @Post('pages/:pageId/re-extract')
  @ApiOperation({ summary: '單頁重新識別' })
  reExtractPage(@Param('pageId', ParseIntPipe) pageId: number, @Body() dto: StartExtractionJobDto) {
    return this.service.reExtractPage(pageId, dto);
  }

  @Get('batches/:batchId/entries')
  @ApiOperation({ summary: '查詢批次識別出的 entry' })
  listEntries(@Param('batchId', ParseIntPipe) batchId: number, @Query() query: QueryPayrollEntriesDto) {
    return this.service.listEntries(batchId, query);
  }

  @Get('entries/:entryId')
  @ApiOperation({ summary: '查詢單一 entry 詳情' })
  getEntry(@Param('entryId', ParseIntPipe) entryId: number) {
    return this.service.getEntry(entryId);
  }

  @Patch('entries/:entryId/fields/:fieldId')
  @ApiOperation({ summary: '修正單一欄位' })
  updateField(
    @Param('entryId', ParseIntPipe) entryId: number,
    @Param('fieldId', ParseIntPipe) fieldId: number,
    @Body() dto: UpdateEntryFieldDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.updateField(entryId, fieldId, dto, getUserId(req));
  }

  @Post('entries/:entryId/employee-match')
  @ApiOperation({ summary: '指定配對員工' })
  matchEmployee(
    @Param('entryId', ParseIntPipe) entryId: number,
    @Body() dto: MatchEmployeeDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.matchEmployee(entryId, dto, getUserId(req));
  }

  @Post('entries/:entryId/exclude')
  @ApiOperation({ summary: '排除不計糧資料列' })
  excludeEntry(
    @Param('entryId', ParseIntPipe) entryId: number,
    @Body() dto: ExcludeEntryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.excludeEntry(entryId, dto, getUserId(req));
  }

  @Post('pages/:pageId/confirm-all')
  @ApiOperation({ summary: '確認整頁所有 entries' })
  confirmPage(
    @Param('pageId', ParseIntPipe) pageId: number,
    @Body() dto: ConfirmPageDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.confirmPage(pageId, dto.reason, getUserId(req));
  }

  @Get('batches/:batchId/stats')
  @ApiOperation({ summary: '批次統計' })
  getStats(@Param('batchId', ParseIntPipe) batchId: number) {
    return this.service.getBatchStats(batchId);
  }
}
