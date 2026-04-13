import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import type { Response } from 'express';
import { VerificationService } from './verification.service';
import { OcrService } from './ocr.service';
import { GpsService } from './gps.service';
import {
  FileValidationPipe,
  FilesValidationPipe,
  ALL_ALLOWED_MIME_TYPES,
  MAX_VERIFICATION_FILE_SIZE,
} from '../common/file-validation.pipe';

function getUploadDir() {
  const dir = path.join(process.cwd(), 'uploads', 'verification');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

const verificationStorage = diskStorage({
  destination: (_req: any, _file: any, cb: any) => cb(null, getUploadDir()),
  filename: (_req: any, file: any, cb: any) => {
    const ext = path.extname(file.originalname);
    const name = uuidv4() + ext;
    cb(null, name);
  },
});

@Controller('verification')
@UseGuards(AuthGuard('jwt'))
export class VerificationController {
  constructor(
    private readonly service: VerificationService,
    private readonly ocrService: OcrService,
    private readonly gpsService: GpsService,
  ) {}

  // ── 上傳入帳票 Excel ──────────────────────────────────────
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: verificationStorage,
      limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    }),
  )
  async uploadFile(
    @UploadedFile(new FileValidationPipe({ maxSize: MAX_VERIFICATION_FILE_SIZE }))
    file: Express.Multer.File,
    @Body('source_type') sourceType: string,
    @Body('period_year') periodYear?: string,
    @Body('period_month') periodMonth?: string,
    @Body('notes') notes?: string,
    @Body('force_reimport') forceReimport?: string,
    @Request() req?: any,
  ) {
    return this.service.uploadAndParseFile(file, {
      sourceType: sourceType || 'receipt',
      periodYear: periodYear ? +periodYear : undefined,
      periodMonth: periodMonth ? +periodMonth : undefined,
      notes,
      userId: req?.user?.id,
      forceReimport: forceReimport === 'true',
    });
  }

  // ── 確認匯入，開始自動配對 ────────────────────────────────
  @Post('batch/:batchId/confirm')
  async confirmBatch(
    @Param('batchId') batchId: string,
    @Request() req?: any,
  ) {
    return this.service.confirmBatchAndMatch(+batchId, req?.user?.id);
  }

  // ── 刪除批次（只允許 pending/cancelled/failed 狀態）────────
  @Delete('batch/:batchId')
  async deleteBatch(@Param('batchId') batchId: string) {
    return this.service.deleteBatch(+batchId);
  }

  // ── 作廢批次（只允許 completed 狀態）──────────────────────
  @Post('batch/:batchId/cancel')
  async cancelBatch(@Param('batchId') batchId: string) {
    return this.service.cancelBatch(+batchId);
  }

  // ── 同步打卡記錄 ──────────────────────────────────────────
  @Post('sync-clock')
  async syncClock(
    @Body() body: { year: number; month: number },
    @Request() req?: any,
  ) {
    return this.service.syncClockRecords({
      year: body.year,
      month: body.month,
      userId: req?.user?.id,
    });
  }

  // ══════════════════════════════════════════════════════════════
  // OCR 相關端點
  // ══════════════════════════════════════════════════════════════

  // ── 上傳掃描圖片進行 AI OCR 辨識 ─────────────────────────
  @Post('ocr/process')
  @UseInterceptors(
    FilesInterceptor('files', 20, {
      storage: verificationStorage,
      limits: { fileSize: 50 * 1024 * 1024 }, // 50MB per file
    }),
  )
  async processOcr(
    @UploadedFiles(new FilesValidationPipe({ maxSize: MAX_VERIFICATION_FILE_SIZE }))
    files: Express.Multer.File[],
    @Body('source_type') sourceType: string,
    @Body('period_year') periodYear?: string,
    @Body('period_month') periodMonth?: string,
    @Request() req?: any,
  ) {
    return this.ocrService.processMultipleImages(files, sourceType as any, {
      periodYear: periodYear ? +periodYear : undefined,
      periodMonth: periodMonth ? +periodMonth : undefined,
      userId: req?.user?.id,
    });
  }

  // ── 確認 OCR 辨識結果 ────────────────────────────────────
  @Post('ocr/:ocrId/confirm')
  async confirmOcr(
    @Param('ocrId') ocrId: string,
    @Body('corrections') corrections?: Record<string, any>,
    @Request() req?: any,
  ) {
    return this.ocrService.confirmOcrResult(+ocrId, corrections, req?.user?.id);
  }

  // ── 刪除 OCR 結果 ────────────────────────────────────────
  @Delete('ocr/:ocrId')
  async deleteOcr(@Param('ocrId') ocrId: string) {
    return this.ocrService.deleteOcrResult(+ocrId);
  }

  // ── 取得待確認的 OCR 結果列表 ─────────────────────────────
  @Get('ocr/pending')
  async getPendingOcr(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return this.ocrService.getPendingOcrResults({
      page: page ? +page : 1,
      limit: limit ? +limit : 20,
      status,
    });
  }

   // ════════════════════════════════════════════════════════════
  // GPS 相關端點
  // ════════════════════════════════════════════════════════════

  // ── 上傳 GPS 追蹤報表 Excel（支援多檔案） ───────────────────────────
  @Post('gps/upload')
  @UseInterceptors(
    FilesInterceptor('files', 20, {
      storage: verificationStorage,
      limits: { fileSize: 50 * 1024 * 1024 }, // 50MB per file
    }),
  )
  async uploadGps(
    @UploadedFiles(new FilesValidationPipe({ maxSize: MAX_VERIFICATION_FILE_SIZE }))
    files: Express.Multer.File[],
    @Body('period_year') periodYear?: string,
    @Body('period_month') periodMonth?: string,
    @Request() req?: any,
  ) {
    if (!files || files.length === 0) {
      return { results: [], total: 0, succeeded: 0, failed: 0, duplicates: 0 };
    }
    const opts = {
      periodYear: periodYear ? +periodYear : undefined,
      periodMonth: periodMonth ? +periodMonth : undefined,
      userId: req?.user?.id,
    };
    const results: any[] = [];
    for (const file of files) {
      try {
        const result = await this.gpsService.uploadAndProcessGps(file, opts);
        results.push({ file_name: file.originalname, ...result });
      } catch (err: any) {
        results.push({
          file_name: file.originalname,
          error: err?.message || 'GPS 報表處理失敗',
          status: 'failed',
        });
      }
    }
    const succeeded = results.filter(r => !r.error && !r.duplicate).length;
    const duplicates = results.filter(r => r.duplicate).length;
    const failed = results.filter(r => r.error && !r.duplicate).length;
    return { results, total: files.length, succeeded, failed, duplicates };
  }

  // ════════════════════════════════════════════════════════════
  // 核對工作台（原有端點）
  // ══════════════════════════════════════════════════════════════

  // ── 核對工作台資料 ────────────────────────────────────────
  @Get('workbench')
  async getWorkbench(
    @Query('page') page?: string,
    @Query('page_size') pageSize?: string,
    @Query('filter_status') filterStatus?: string,
    @Query('filter_work_type') filterWorkType?: string,
    @Query('search_keyword') searchKeyword?: string,
    @Query('sort_by') sortBy?: string,
    @Query('sort_order') sortOrder?: string,
    @Query('date_from') dateFrom?: string,
    @Query('date_to') dateTo?: string,
  ) {
    return this.service.getWorkbench({
      page: page ? +page : 1,
      pageSize: pageSize ? +pageSize : 20,
      filterStatus,
      filterWorkType,
      searchKeyword,
      sortBy,
      sortOrder,
      dateFrom,
      dateTo,
    });
  }

  // ── 匯出工作台資料為 Excel ────────────────────────────────
  @Get('export')
  async exportWorkbench(
    @Res() res: Response,
    @Query('filter_status') filterStatus?: string,
    @Query('filter_work_type') filterWorkType?: string,
    @Query('search_keyword') searchKeyword?: string,
    @Query('date_from') dateFrom?: string,
    @Query('date_to') dateTo?: string,
  ) {
    const buffer = await this.service.exportWorkbench({
      page: 1,
      pageSize: 100000,
      filterStatus,
      filterWorkType,
      searchKeyword,
      dateFrom,
      dateTo,
    });

    const filename = `verification_export_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.end(buffer);
  }

  // ── 單筆配對詳情 ──────────────────────────────────────────
  @Get('match/:matchId')
  async getMatchDetail(@Param('matchId') matchId: string) {
    return this.service.getMatchDetail(+matchId);
  }

  // ── 對配對結果進行操作 ────────────────────────────────────
  @Post('match/:matchId/action')
  async performMatchAction(
    @Param('matchId') matchId: string,
    @Body() body: { action: string; override_data?: any; notes?: string },
    @Request() req?: any,
  ) {
    return this.service.performMatchAction(+matchId, {
      action: body.action,
      overrideData: body.override_data,
      notes: body.notes,
      userId: req?.user?.id,
      userName: req?.user?.displayName || req?.user?.username,
    });
  }

  // ── 批量操作 ──────────────────────────────────────────────
  @Post('batch-action')
  async batchAction(
    @Body() body: { match_ids: number[]; action: string; notes?: string },
    @Request() req?: any,
  ) {
    return this.service.batchAction({
      matchIds: body.match_ids,
      action: body.action,
      notes: body.notes,
      userId: req?.user?.id,
      userName: req?.user?.displayName || req?.user?.username,
    });
  }

  // ── 匯入批次列表 ──────────────────────────────────────────
  @Get('batches')
  async getBatches(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.getBatches({
      page: page ? +page : 1,
      limit: limit ? +limit : 20,
    });
  }


  // ── 已匯入資料列表 ────────────────────────────────────────
  @Get('records')
  async getRecords(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('source_type') sourceType?: string,
    @Query('date_from') dateFrom?: string,
    @Query('date_to') dateTo?: string,
    @Query('search') search?: string,
  ) {
    return this.service.getRecords({
      page: page ? +page : 1,
      limit: limit ? +limit : 20,
      source_type: sourceType,
      date_from: dateFrom,
      date_to: dateTo,
      search,
    });
  }

  // ── 來源列表 ──────────────────────────────────────────────
  @Get('sources')
  async getSources() {
    return this.service.getSources();
  }
}
