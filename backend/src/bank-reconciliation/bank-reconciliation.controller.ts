import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { BankReconciliationService } from './bank-reconciliation.service';
import { PdfParserService } from './pdf-parser.service';

const UPLOAD_DIR = join(process.cwd(), 'uploads', 'bank-statements');
if (!existsSync(UPLOAD_DIR)) {
  mkdirSync(UPLOAD_DIR, { recursive: true });
}

@Controller('bank-reconciliation')
@UseGuards(AuthGuard('jwt'))
export class BankReconciliationController {
  constructor(
    private readonly service: BankReconciliationService,
    private readonly pdfParser: PdfParserService,
  ) {}

  @Get('transactions')
  findTransactions(
    @Query('bank_account_id') bank_account_id: string,
    @Query('date_from') date_from?: string,
    @Query('date_to') date_to?: string,
    @Query('match_status') match_status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findTransactions({
      bank_account_id: +bank_account_id,
      date_from,
      date_to,
      match_status,
      page: page ? +page : undefined,
      limit: limit ? +limit : undefined,
    });
  }

  @Post('import/:bankAccountId')
  importTransactions(
    @Param('bankAccountId') bankAccountId: string,
    @Body('rows') rows: any[],
  ) {
    return this.service.importTransactions(+bankAccountId, rows);
  }

  /**
   * Upload a PDF bank statement and parse it using AI vision.
   * Returns parsed transactions for preview before importing.
   */
  @Post('parse-pdf')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: UPLOAD_DIR,
      filename: (_req, file, cb) => {
        cb(null, `${uuidv4()}${extname(file.originalname)}`);
      },
    }),
    limits: { fileSize: 30 * 1024 * 1024 }, // 30MB
    fileFilter: (_req, file, cb) => {
      if (file.mimetype === 'application/pdf' || extname(file.originalname).toLowerCase() === '.pdf') {
        cb(null, true);
      } else {
        cb(new BadRequestException('只接受 PDF 文件') as any, false);
      }
    },
  }))
  async parsePdf(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('請上傳 PDF 文件');
    }
    try {
      const result = await this.pdfParser.parsePdf(file.path);
      return result;
    } finally {
      // Clean up uploaded PDF after parsing
      try {
        if (existsSync(file.path)) {
          unlinkSync(file.path);
        }
      } catch {}
    }
  }

  @Get('summary/:bankAccountId')
  getSummary(
    @Param('bankAccountId') bankAccountId: string,
    @Query('date_from') date_from?: string,
    @Query('date_to') date_to?: string,
  ) {
    return this.service.getSummary(+bankAccountId, date_from, date_to);
  }

  @Get('candidates/:txId')
  findCandidates(@Param('txId') txId: string) {
    return this.service.findMatchCandidates(+txId);
  }

  @Post('auto-match/:bankAccountId')
  autoMatchAll(@Param('bankAccountId') bankAccountId: string) {
    return this.service.autoMatchAll(+bankAccountId);
  }

  @Post('match/:txId')
  match(
    @Param('txId') txId: string,
    @Body('type') type: 'payment_in' | 'payment_out',
    @Body('matchedId') matchedId: number,
  ) {
    return this.service.applyMatch(+txId, type, matchedId);
  }

  @Post('unmatch/:txId')
  unmatch(@Param('txId') txId: string) {
    return this.service.unmatch(+txId);
  }

  @Post('exclude/:txId')
  exclude(@Param('txId') txId: string, @Body('remarks') remarks?: string) {
    return this.service.exclude(+txId, remarks);
  }
}
