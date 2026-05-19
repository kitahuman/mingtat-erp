import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  Request,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { InvoicesService } from './invoices.service';
import { InvoicePdfService } from './invoice-pdf.service';
import type { InvoicePdfLanguage } from './invoice-pdf.service';
import {
  CreateInvoiceDto,
  UpdateInvoiceDto,
  RecordPaymentDto,
  InvoiceWorkLogsDto,
  SaveInvoicePrepareDto,
  MatchInvoiceRatesDto,
  UpdateInvoiceItemsDto,
  SaveInvoicePricingDraftDto,
} from './dto/create-invoice.dto';

@Controller('invoices')
@UseGuards(AuthGuard('jwt'))
export class InvoicesController {
  constructor(
    private readonly service: InvoicesService,
    private readonly invoicePdfService: InvoicePdfService,
  ) {}

  private parseBool(value: string | undefined) {
    return value === undefined
      ? undefined
      : !['false', '0', 'no'].includes(String(value).toLowerCase());
  }

  @Get()
  findAll(@Query() query: any) {
    return this.service.findAll(query);
  }

  @Get(':id/pdf')
  async exportPdf(
    @Param('id') id: number,
    @Query('language') language: InvoicePdfLanguage,
    @Query('show_bank') showBank: string,
    @Query('show_client_address') showClientAddress: string,
    @Query('show_client_phone') showClientPhone: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const pdf = await this.invoicePdfService.generateInvoicePdf(Number(id), {
      language,
      showBank: this.parseBool(showBank),
      showClientAddress: this.parseBool(showClientAddress),
      showClientPhone: this.parseBool(showClientPhone),
    });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="invoice-${Number(id)}.pdf"`,
      'Content-Length': pdf.length,
    });
    return new StreamableFile(pdf);
  }

  @Get(':id/pdf-html')
  async previewPdfHtml(
    @Param('id') id: number,
    @Query('language') language: InvoicePdfLanguage,
    @Query('show_bank') showBank: string,
    @Query('show_client_address') showClientAddress: string,
    @Query('show_client_phone') showClientPhone: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const html = await this.invoicePdfService.generateInvoiceHtml(Number(id), {
      language,
      showBank: this.parseBool(showBank),
      showClientAddress: this.parseBool(showClientAddress),
      showClientPhone: this.parseBool(showClientPhone),
    });

    res.set({
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    return html;
  }

  @Get(':id/pdf-preview')
  previewPdfHtmlAlias(
    @Param('id') id: number,
    @Query('language') language: InvoicePdfLanguage,
    @Query('show_bank') showBank: string,
    @Query('show_client_address') showClientAddress: string,
    @Query('show_client_phone') showClientPhone: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.previewPdfHtml(
      id,
      language,
      showBank,
      showClientAddress,
      showClientPhone,
      res,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: number) {
    return this.service.findOne(Number(id));
  }

  @Post()
  create(@Body() dto: CreateInvoiceDto, @Request() req: any) {
    return this.service.create(
      dto,
      req.user?.id || req.user?.userId || 0,
      req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ||
        req.ip ||
        undefined,
    );
  }

  @Post('from-quotation/:quotationId')
  createFromQuotation(
    @Param('quotationId') quotationId: number,
    @Body() dto: CreateInvoiceDto,
    @Request() req: any,
  ) {
    return this.service.createFromQuotation(
      Number(quotationId),
      dto,
      req.user?.id || req.user?.userId || 0,
    );
  }

  @Put(':id')
  update(
    @Param('id') id: number,
    @Body() dto: UpdateInvoiceDto,
    @Request() req: any,
  ) {
    return this.service.update(
      Number(id),
      dto,
      req.user?.id || req.user?.userId || 0,
    );
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: number, @Body('status') status: string) {
    return this.service.updateStatus(Number(id), status);
  }

  @Get(':id/prepare')
  getPrepare(@Param('id') id: number) {
    return this.service.getPrepare(Number(id));
  }

  @Put(':id/prepare')
  savePrepare(@Param('id') id: number, @Body() dto: SaveInvoicePrepareDto) {
    return this.service.savePrepare(Number(id), dto);
  }

  @Delete(':id/prepare')
  clearPrepare(@Param('id') id: number) {
    return this.service.clearPrepare(Number(id));
  }

  @Get(':id/pricing-data')
  getPricingData(@Param('id') id: number) {
    return this.service.getPricingData(Number(id));
  }

  @Get(':id/pricing-draft')
  getPricingDraft(@Param('id') id: number) {
    return this.service.getPricingDraft(Number(id));
  }

  @Put(':id/pricing-draft')
  savePricingDraft(
    @Param('id') id: number,
    @Body() dto: SaveInvoicePricingDraftDto,
  ) {
    return this.service.savePricingDraft(Number(id), dto);
  }

  @Post(':id/match-rates')
  matchRates(@Param('id') id: number, @Body() dto: MatchInvoiceRatesDto) {
    return this.service.matchRates(Number(id), dto);
  }

  @Put(':id/items')
  updateItems(@Param('id') id: number, @Body() dto: UpdateInvoiceItemsDto) {
    return this.service.updateItems(Number(id), dto);
  }

  @Post(':id/work-logs')
  linkWorkLogs(@Param('id') id: number, @Body() dto: InvoiceWorkLogsDto) {
    return this.service.linkWorkLogs(Number(id), dto.work_log_ids || []);
  }

  @Delete(':id/work-logs')
  unlinkWorkLogs(@Param('id') id: number, @Body() dto: InvoiceWorkLogsDto) {
    return this.service.unlinkWorkLogs(Number(id), dto.work_log_ids || []);
  }

  @Get(':id/work-logs')
  getLinkedWorkLogs(@Param('id') id: number) {
    return this.service.getLinkedWorkLogs(Number(id));
  }

  @Post(':id/record-payment')
  recordPayment(@Param('id') id: number, @Body() dto: RecordPaymentDto) {
    return this.service.recordPayment(Number(id), dto);
  }

  @Delete(':id/payment/:paymentId')
  deletePayment(
    @Param('id') id: number,
    @Param('paymentId') paymentId: number,
  ) {
    return this.service.deletePayment(Number(id), Number(paymentId));
  }

  @Get(':id/payments')
  getPayments(@Param('id') id: number) {
    return this.service.getPayments(Number(id));
  }

  @Delete(':id')
  remove(@Param('id') id: number, @Request() req: any) {
    return this.service.delete(
      Number(id),
      req.user?.id || req.user?.userId || 0,
      req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ||
        req.ip ||
        undefined,
    );
  }
}
