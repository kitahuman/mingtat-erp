import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
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

  /** Create a manual transaction */
  @Post('transactions')
  createTransaction(
    @Body() body: {
      bank_account_id: number;
      date: string;
      description: string;
      amount: number;
      reference_no?: string;
      balance?: number;
      bank_txn_remark?: string;
    },
  ) {
    return this.service.createTransaction(body);
  }

  /** Update a transaction */
  @Put('transactions/:id')
  updateTransaction(
    @Param('id') id: string,
    @Body() body: {
      date?: string;
      description?: string;
      amount?: number;
      reference_no?: string;
      balance?: number;
      bank_txn_remark?: string;
    },
  ) {
    return this.service.updateTransaction(+id, body);
  }

  /** Delete a single transaction */
  @Delete('transactions/:id')
  deleteTransaction(@Param('id') id: string) {
    return this.service.deleteTransaction(+id);
  }

  /** Update remark for a transaction */
  @Put('transactions/:id/remark')
  updateRemark(
    @Param('id') id: string,
    @Body('bank_txn_remark') remark: string,
  ) {
    return this.service.updateRemark(+id, remark);
  }

  /** Batch delete transactions */
  @Post('batch-delete')
  batchDelete(@Body('ids') ids: number[]) {
    return this.service.batchDelete(ids);
  }

  /** Batch move transactions to another bank account */
  @Post('batch-move')
  batchMove(
    @Body('ids') ids: number[],
    @Body('target_bank_account_id') targetBankAccountId: number,
  ) {
    return this.service.batchMove(ids, targetBankAccountId);
  }

  @Post('import/:bankAccountId')
  importTransactions(
    @Param('bankAccountId') bankAccountId: string,
    @Body('rows') rows: any[],
    @Body('source') source?: string,
  ) {
    return this.service.importTransactions(+bankAccountId, rows, source || 'csv');
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
  async parsePdf(
    @UploadedFile() file: Express.Multer.File,
    @Body('companies') companiesJson?: string,
    @Body('bank_accounts') bankAccountsJson?: string,
  ) {
    if (!file) {
      throw new BadRequestException('請上傳 PDF 文件');
    }
    // Parse company and bank account lists if provided
    let companies: any[] = [];
    let bankAccounts: any[] = [];
    try {
      if (companiesJson) companies = JSON.parse(companiesJson);
      if (bankAccountsJson) bankAccounts = JSON.parse(bankAccountsJson);
    } catch {}

    try {
      const result = await this.pdfParser.parsePdf(file.path, companies, bankAccounts);
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
