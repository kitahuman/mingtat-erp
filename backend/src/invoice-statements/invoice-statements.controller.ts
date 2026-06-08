import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Request,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request as ExpressRequest, Response } from 'express';
import { InvoiceStatementPdfService } from './invoice-statement-pdf.service';
import { InvoiceStatementsService } from './invoice-statements.service';
import {
  CreateInvoiceStatementDto,
  MatchInvoiceStatementInvoicesDto,
  UpdateInvoiceStatementDto,
} from './dto/create-invoice-statement.dto';

type AuthenticatedInvoiceStatementRequest = ExpressRequest & {
  user?: { id?: number; userId?: number };
};

type InvoiceStatementListQuery = {
  page?: number;
  limit?: number;
  status?: string;
  client_id?: number | string;
  company_id?: number | string;
  period_from?: string;
  period_to?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: string;
  [key: string]: unknown;
};

@Controller('invoice-statements')
@UseGuards(AuthGuard('jwt'))
export class InvoiceStatementsController {
  constructor(
    private readonly service: InvoiceStatementsService,
    private readonly pdfService: InvoiceStatementPdfService,
  ) {}

  private getUserId(req: AuthenticatedInvoiceStatementRequest): number {
    return req.user?.id || req.user?.userId || 0;
  }

  private getIpAddress(
    req: AuthenticatedInvoiceStatementRequest,
  ): string | undefined {
    const forwardedFor = req.headers['x-forwarded-for'];
    const forwardedValue = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : forwardedFor;
    return forwardedValue?.split(',')[0]?.trim() || req.ip || undefined;
  }

  @Get()
  findAll(@Query() query: InvoiceStatementListQuery) {
    return this.service.findAll(query);
  }

  @Get('filter-options/:column')
  getFilterOptions(
    @Param('column') column: string,
    @Query() query: InvoiceStatementListQuery,
  ) {
    return this.service.getFilterOptions(column, query);
  }

  @Post('matching-invoices')
  matchingInvoices(@Body() dto: MatchInvoiceStatementInvoicesDto) {
    return this.service.findMatchingInvoices(dto);
  }

  @Get(':id/pdf')
  async exportPdf(
    @Param('id') id: number,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.pdfService.generateStatementPdf(Number(id));
    const statementNo = result.statement.statement_no || `statement-${id}`;
    const clientCode =
      result.statement.client?.code || result.statement.client?.name || '';
    const title = result.statement.statement_title || '';
    const rawFilename = `${statementNo}_${clientCode}_${title}.pdf`;
    const encodedFilename = encodeURIComponent(rawFilename);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodedFilename}; filename="${encodedFilename}"`,
      'Content-Length': result.pdf.length,
    });
    return new StreamableFile(result.pdf);
  }

  @Get(':id/pdf-html')
  async previewPdfHtml(
    @Param('id') id: number,
    @Res({ passthrough: true }) res: Response,
  ) {
    const html = await this.pdfService.generateStatementHtml(Number(id));
    res.set({
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    return html;
  }

  @Get(':id/pdf-preview')
  previewPdfHtmlAlias(
    @Param('id') id: number,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.previewPdfHtml(id, res);
  }

  @Get(':id')
  findOne(@Param('id') id: number) {
    return this.service.findOne(Number(id));
  }

  @Post()
  create(
    @Body() dto: CreateInvoiceStatementDto,
    @Request() req: AuthenticatedInvoiceStatementRequest,
  ) {
    return this.service.create(
      dto,
      this.getUserId(req),
      this.getIpAddress(req),
    );
  }

  @Put(':id')
  update(
    @Param('id') id: number,
    @Body() dto: UpdateInvoiceStatementDto,
    @Request() req: AuthenticatedInvoiceStatementRequest,
  ) {
    return this.service.update(Number(id), dto, this.getUserId(req));
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: number, @Body('status') status: string) {
    return this.service.updateStatus(Number(id), status);
  }

  @Delete(':id')
  remove(
    @Param('id') id: number,
    @Request() req: AuthenticatedInvoiceStatementRequest,
  ) {
    return this.service.delete(
      Number(id),
      this.getUserId(req),
      this.getIpAddress(req),
    );
  }
}
