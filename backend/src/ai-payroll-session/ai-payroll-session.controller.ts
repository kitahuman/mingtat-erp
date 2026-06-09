import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
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
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { extname, join } from 'path';
import { diskStorage } from 'multer';
import { UploadPayrollDocumentDto } from '../ai-payroll/dto/upload-payroll-document.dto';
import {
  AnswerQuestionDto,
  BatchDismissQuestionsDto,
  QueryQuestionsDto,
} from './dto/answer-question.dto';
import { CreateSessionDto } from './dto/create-session.dto';
import {
  BatchConfirmReconcileDto,
  GeneratePayrollDto,
  RetrySessionDto,
  StartSessionDto,
} from './dto/generate-payroll.dto';
import {
  PreviewPayrollDto,
  QueryReconcileItemsDto,
  QuerySourcesDto,
} from './dto/query-session-data.dto';
import { QuerySessionsDto } from './dto/query-sessions.dto';
import { UpdateReconcileItemDto } from './dto/update-reconcile-item.dto';
import { AiPayrollGenerateService } from './ai-payroll-generate.service';
import { AiPayrollQuestionService } from './ai-payroll-question.service';
import { AiPayrollReconcileService } from './ai-payroll-reconcile.service';
import { AiPayrollSessionService } from './ai-payroll-session.service';

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

@ApiTags('ai-payroll-sessions')
@ApiBearerAuth('JWT-auth')
@Controller('ai-payroll-sessions')
@UseGuards(AuthGuard('jwt'))
export class AiPayrollSessionController {
  constructor(
    private readonly sessionService: AiPayrollSessionService,
    private readonly reconcileService: AiPayrollReconcileService,
    private readonly questionService: AiPayrollQuestionService,
    private readonly generateService: AiPayrollGenerateService,
  ) {}

  @Post()
  @ApiOperation({ summary: '建立 AI 計糧會話' })
  create(@Body() dto: CreateSessionDto, @Req() req: AuthenticatedRequest) {
    return this.sessionService.createSession(dto, getUserId(req));
  }

  @Get()
  @ApiOperation({ summary: '查詢 AI 計糧會話列表' })
  list(@Query() query: QuerySessionsDto) {
    return this.sessionService.listSessions(query);
  }

  @Get(':sessionId')
  @ApiOperation({ summary: '取得 AI 計糧會話詳情' })
  get(@Param('sessionId', ParseIntPipe) sessionId: number) {
    return this.sessionService.getSession(sessionId);
  }

  @Delete(':sessionId')
  @ApiOperation({ summary: '取消 AI 計糧會話' })
  remove(@Param('sessionId', ParseIntPipe) sessionId: number) {
    return this.sessionService.deleteSession(sessionId);
  }

  @Post(':sessionId/documents')
  @UseInterceptors(
    FileInterceptor('file', {
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
        return cb(null, true);
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        formTypeHint: { type: 'string', example: 'auto' },
      },
      required: ['file'],
    },
  })
  @ApiOperation({ summary: '上傳 AI 計糧會話文件' })
  uploadDocument(
    @Param('sessionId', ParseIntPipe) sessionId: number,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadPayrollDocumentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    if (!file) throw new BadRequestException('請上傳文件');
    return this.sessionService.uploadDocument(sessionId, file, dto, getUserId(req));
  }

  @Get(':sessionId/documents')
  @ApiOperation({ summary: '查詢 AI 計糧會話文件' })
  listDocuments(@Param('sessionId', ParseIntPipe) sessionId: number) {
    return this.sessionService.listDocuments(sessionId);
  }

  @Delete(':sessionId/documents/:docId')
  @ApiOperation({ summary: '刪除 AI 計糧會話文件' })
  deleteDocument(
    @Param('sessionId', ParseIntPipe) sessionId: number,
    @Param('docId', ParseIntPipe) docId: number,
  ) {
    return this.sessionService.deleteDocument(sessionId, docId);
  }

  @Post(':sessionId/start')
  @HttpCode(202)
  @ApiOperation({ summary: '開始 AI 計糧會話流程' })
  start(
    @Param('sessionId', ParseIntPipe) sessionId: number,
    @Body() dto: StartSessionDto,
  ) {
    return this.sessionService.start(sessionId, dto);
  }

  @Get(':sessionId/progress')
  @ApiOperation({ summary: '查詢 AI 計糧會話進度' })
  getProgress(@Param('sessionId', ParseIntPipe) sessionId: number) {
    return this.sessionService.getProgress(sessionId);
  }

  @Post(':sessionId/retry')
  @ApiOperation({ summary: '重試 AI 計糧會話指定步驟' })
  retry(
    @Param('sessionId', ParseIntPipe) sessionId: number,
    @Body() dto: RetrySessionDto,
  ) {
    return this.sessionService.retry(sessionId, dto);
  }

  @Get(':sessionId/sources')
  @ApiOperation({ summary: '查詢 AI 計糧來源資料' })
  listSources(
    @Param('sessionId', ParseIntPipe) sessionId: number,
    @Query() query: QuerySourcesDto,
  ) {
    return this.reconcileService.listSources(sessionId, query);
  }

  @Get(':sessionId/sources/summary')
  @ApiOperation({ summary: '查詢 AI 計糧來源摘要' })
  getSourcesSummary(@Param('sessionId', ParseIntPipe) sessionId: number) {
    return this.reconcileService.getSourcesSummary(sessionId);
  }

  @Get(':sessionId/reconcile-items')
  @ApiOperation({ summary: '查詢 AI 計糧核對項目' })
  listReconcileItems(
    @Param('sessionId', ParseIntPipe) sessionId: number,
    @Query() query: QueryReconcileItemsDto,
  ) {
    return this.reconcileService.listReconcileItems(sessionId, query);
  }

  @Get(':sessionId/reconcile-items/:itemId')
  @ApiOperation({ summary: '取得 AI 計糧核對項目詳情' })
  getReconcileItem(
    @Param('sessionId', ParseIntPipe) sessionId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
  ) {
    return this.reconcileService.getReconcileItem(sessionId, itemId);
  }

  @Patch(':sessionId/reconcile-items/:itemId')
  @ApiOperation({ summary: '更新 AI 計糧核對項目' })
  updateReconcileItem(
    @Param('sessionId', ParseIntPipe) sessionId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: UpdateReconcileItemDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.reconcileService.updateReconcileItem(
      sessionId,
      itemId,
      dto,
      getUserId(req),
    );
  }

  @Post(':sessionId/reconcile-items/batch-confirm')
  @ApiOperation({ summary: '批量確認 AI 計糧核對項目' })
  batchConfirmReconcile(
    @Param('sessionId', ParseIntPipe) sessionId: number,
    @Body() dto: BatchConfirmReconcileDto,
  ) {
    return this.reconcileService.batchConfirm(sessionId, dto);
  }

  @Get(':sessionId/questions')
  @ApiOperation({ summary: '查詢 AI 計糧待確認問題' })
  listQuestions(
    @Param('sessionId', ParseIntPipe) sessionId: number,
    @Query() query: QueryQuestionsDto,
  ) {
    return this.questionService.listQuestions(sessionId, query);
  }

  @Post(':sessionId/questions/:questionId/answer')
  @ApiOperation({ summary: '回答 AI 計糧問題' })
  answerQuestion(
    @Param('sessionId', ParseIntPipe) sessionId: number,
    @Param('questionId', ParseIntPipe) questionId: number,
    @Body() dto: AnswerQuestionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.questionService.answerQuestion(
      sessionId,
      questionId,
      dto,
      getUserId(req),
    );
  }

  @Post(':sessionId/questions/batch-dismiss')
  @ApiOperation({ summary: '批量忽略 AI 計糧問題' })
  batchDismissQuestions(
    @Param('sessionId', ParseIntPipe) sessionId: number,
    @Body() dto: BatchDismissQuestionsDto,
  ) {
    return this.questionService.batchDismiss(sessionId, dto);
  }

  @Get(':sessionId/payroll-preview')
  @ApiOperation({ summary: '預覽 AI 計糧生成糧單資料' })
  previewPayroll(
    @Param('sessionId', ParseIntPipe) sessionId: number,
    @Query() query: PreviewPayrollDto,
  ) {
    return this.generateService.preview(sessionId, query);
  }

  @Post(':sessionId/generate-payroll')
  @ApiOperation({ summary: '生成 AI 計糧糧單' })
  generatePayroll(
    @Param('sessionId', ParseIntPipe) sessionId: number,
    @Body() dto: GeneratePayrollDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.sessionService.generate(sessionId, dto, getUserId(req));
  }
}
