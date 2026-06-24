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
import type { Request as ExpressRequest, Response } from 'express';
import { InvoicesService } from './invoices.service';
import { InvoicePdfService } from './invoice-pdf.service';
import type { InvoicePdfLanguage, InvoicePdfOptions } from './invoice-pdf.service';
import {
  CreateInvoiceDto,
  UpdateInvoiceDto,
  RecordPaymentDto,
  InvoiceWorkLogsDto,
  SaveInvoicePrepareDto,
  MatchInvoiceRatesDto,
  UpdateInvoiceItemsDto,
  SaveInvoicePricingDraftDto,
  CreateInvoiceRevisionDto,
  SetActiveInvoiceRevisionDto,
  CreateFromQuotationDto,
  PreviewNumberDto,
} from './dto/create-invoice.dto';

type AuthenticatedInvoiceRequest = ExpressRequest & {
  user?: { id?: number; userId?: number };
};

type InvoiceBatchOperationBody = {
  invoice_ids?: number[];
};

type InvoiceListQuery = {
  page?: number;
  limit?: number;
  status?: string;
  status_ne?: string;
  invoice_type?: string;
  client_id?: number | string;
  project_id?: number | string;
  date_from?: string;
  date_to?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: string;
  [key: string]: unknown;
};

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

  private parseFontSizes(
    query: Record<string, unknown>,
  ): InvoicePdfOptions['fontSizes'] {
    const readNumber = (...keys: string[]) => {
      for (const key of keys) {
        const rawValue = query[key];
        const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
        if (value === undefined || value === null || value === '') continue;
        const numberValue = Number(value);
        if (Number.isFinite(numberValue) && numberValue > 0) return numberValue;
      }
      return undefined;
    };

    const fontSizes = {
      title: readNumber('font_size_title', 'fontSizes[title]', 'fontSizes.title'),
      itemName: readNumber(
        'font_size_item_name',
        'fontSizes[itemName]',
        'fontSizes.itemName',
      ),
      itemDesc: readNumber(
        'font_size_item_desc',
        'fontSizes[itemDesc]',
        'fontSizes.itemDesc',
      ),
      paymentTerms: readNumber(
        'font_size_payment_terms',
        'fontSizes[paymentTerms]',
        'fontSizes.paymentTerms',
      ),
    };

    return Object.values(fontSizes).some((value) => value !== undefined)
      ? fontSizes
      : undefined;
  }

  private getUserId(req: AuthenticatedInvoiceRequest): number {
    return req.user?.id || req.user?.userId || 0;
  }

  private getIpAddress(req: AuthenticatedInvoiceRequest): string | undefined {
    const forwardedFor = req.headers['x-forwarded-for'];
    const forwardedValue = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : forwardedFor;
    return forwardedValue?.split(',')[0]?.trim() || req.ip || undefined;
  }

  @Get()
  findAll(@Query() query: InvoiceListQuery) {
    return this.service.findAll(query);
  }

  @Post('search')
  findAllPost(@Body() body: any) {
    return this.service.findAll(body);
  }

  @Post('batch-void')
  batchVoid(@Body() body: InvoiceBatchOperationBody) {
    return this.service.batchVoid(body.invoice_ids || []);
  }

  // 必須放在 :id 路由之前，否則會被 :id 攔截
  @Post('preview-number')
  previewNumber(@Body() dto: PreviewNumberDto) {
    return this.service
      .previewInvoiceNo(
        Number(dto.company_id),
        dto.client_id ? Number(dto.client_id) : null,
        new Date(dto.date),
      )
      .then((invoice_no) => ({ invoice_no }));
  }

  @Post('batch-move-to-statement')
  batchMoveToStatement(@Body() body: InvoiceBatchOperationBody) {
    return this.service.batchMoveToStatement(body.invoice_ids || []);
  }

  @Get('filter-options/:column')
  getFilterOptions(
    @Param('column') column: string,
    @Query() query: InvoiceListQuery,
  ) {
    return this.service.getFilterOptions(column, query);
  }

  @Post('filter-options/:column')
  postFilterOptions(
    @Param('column') column: string,
    @Body() body: any,
  ) {
    return this.service.getFilterOptions(column, body);
  }

  @Get(':id/pdf')
  async exportPdf(
    @Param('id') id: number,
    @Query('language') language: InvoicePdfLanguage,
    @Query('show_bank') showBank: string,
    @Query('show_client_address') showClientAddress: string,
    @Query('show_client_phone') showClientPhone: string,
    @Query('show_client_contact') showClientContact: string,
    @Query('show_client_info') showClientInfo: string,
    @Query('show_signature') showSignature: string,
    @Query('show_client_signature') showClientSignature: string,
    @Query('show_company_signature') showCompanySignature: string,
    @Query('show_company_stamp') showCompanyStamp: string,
    @Query('override_payment_terms') overridePaymentTerms: string,
    @Query('client_address') clientAddress: string,
    @Query('client_contact') clientContact: string,
    @Query('client_phone') clientPhone: string,
    @Query('client_name') clientName: string,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.invoicePdfService.generateInvoicePdf(Number(id), {
      language,
      showBank: this.parseBool(showBank),
      showClientAddress: this.parseBool(showClientAddress),
      showClientPhone: this.parseBool(showClientPhone),
      showClientContact: this.parseBool(showClientContact),
      showClientInfo: this.parseBool(showClientInfo),
      showSignature: this.parseBool(showSignature),
      showClientSignature: this.parseBool(showClientSignature),
      showCompanySignature: this.parseBool(showCompanySignature),
      showCompanyStamp: this.parseBool(showCompanyStamp),
      overridePaymentTerms,
      overrideClientAddress: clientAddress,
      overrideClientContact: clientContact,
      overrideClientPhone: clientPhone,
      overrideClientName: clientName,
      fontSizes: this.parseFontSizes(query),
    });

    const invoiceNo = result.invoice.invoice_no || `invoice-${id}`;
    const clientCode =
      result.invoice.client?.code || result.invoice.client?.name || '';
    const invoiceTitle = result.invoice.invoice_title || '';
    const rawFilename = `${invoiceNo}_${clientCode}_${invoiceTitle}.pdf`;
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
    @Query('language') language: InvoicePdfLanguage,
    @Query('show_bank') showBank: string,
    @Query('show_client_address') showClientAddress: string,
    @Query('show_client_phone') showClientPhone: string,
    @Query('show_client_contact') showClientContact: string,
    @Query('show_client_info') showClientInfo: string,
    @Query('show_signature') showSignature: string,
    @Query('show_client_signature') showClientSignature: string,
    @Query('show_company_signature') showCompanySignature: string,
    @Query('show_company_stamp') showCompanyStamp: string,
    @Query('override_payment_terms') overridePaymentTerms: string,
    @Query('client_address') clientAddress: string,
    @Query('client_contact') clientContact: string,
    @Query('client_phone') clientPhone: string,
    @Query('client_name') clientName: string,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const html = await this.invoicePdfService.generateInvoiceHtml(Number(id), {
      language,
      showBank: this.parseBool(showBank),
      showClientAddress: this.parseBool(showClientAddress),
      showClientPhone: this.parseBool(showClientPhone),
      showClientContact: this.parseBool(showClientContact),
      showClientInfo: this.parseBool(showClientInfo),
      showSignature: this.parseBool(showSignature),
      showClientSignature: this.parseBool(showClientSignature),
      showCompanySignature: this.parseBool(showCompanySignature),
      showCompanyStamp: this.parseBool(showCompanyStamp),
      overridePaymentTerms,
      overrideClientAddress: clientAddress,
      overrideClientContact: clientContact,
      overrideClientPhone: clientPhone,
      overrideClientName: clientName,
      fontSizes: this.parseFontSizes(query),
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
    @Query('show_client_contact') showClientContact: string,
    @Query('show_client_info') showClientInfo: string,
    @Query('show_signature') showSignature: string,
    @Query('show_client_signature') showClientSignature: string,
    @Query('show_company_signature') showCompanySignature: string,
    @Query('show_company_stamp') showCompanyStamp: string,
    @Query('override_payment_terms') overridePaymentTerms: string,
    @Query('client_address') clientAddress: string,
    @Query('client_contact') clientContact: string,
    @Query('client_phone') clientPhone: string,
    @Query('client_name') clientName: string,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.previewPdfHtml(
      id,
      language,
      showBank,
      showClientAddress,
      showClientPhone,
      showClientContact,
      showClientInfo,
      showSignature,
      showClientSignature,
      showCompanySignature,
      showCompanyStamp,
      overridePaymentTerms,
      clientAddress,
      clientContact,
      clientPhone,
      clientName,
      query,
      res,
    );
  }

  @Get(':id/revisions')
  getRevisions(@Param('id') id: number) {
    return this.service.getRevisions(Number(id));
  }

  @Post(':id/revision')
  createRevision(
    @Param('id') id: number,
    @Body() dto: CreateInvoiceRevisionDto,
    @Request() req: AuthenticatedInvoiceRequest,
  ) {
    return this.service.createRevision(Number(id), dto, this.getUserId(req));
  }

  @Post(':id/duplicate')
  duplicate(
    @Param('id') id: number,
    @Request() req: AuthenticatedInvoiceRequest,
  ) {
    return this.service.duplicate(Number(id), this.getUserId(req));
  }

  @Patch(':id/set-active')
  setActiveRevision(
    @Param('id') id: number,
    @Body() dto: SetActiveInvoiceRevisionDto,
  ) {
    void dto;
    return this.service.setActive(Number(id));
  }

  @Get(':id')
  findOne(@Param('id') id: number) {
    return this.service.findOne(Number(id));
  }

  @Post()
  create(
    @Body() dto: CreateInvoiceDto,
    @Request() req: AuthenticatedInvoiceRequest,
  ) {
    return this.service.create(
      dto,
      this.getUserId(req),
      this.getIpAddress(req),
    );
  }

  @Post('from-quotation/:quotationId')
  createFromQuotation(
    @Param('quotationId') quotationId: number,
    @Body() dto: CreateFromQuotationDto,
    @Request() req: AuthenticatedInvoiceRequest,
  ) {
    return this.service.createFromQuotation(
      Number(quotationId),
      dto,
      this.getUserId(req),
    );
  }

  @Put(':id')
  update(
    @Param('id') id: number,
    @Body() dto: UpdateInvoiceDto,
    @Request() req: AuthenticatedInvoiceRequest,
  ) {
    return this.service.update(Number(id), dto, this.getUserId(req));
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
  remove(@Param('id') id: number, @Request() req: AuthenticatedInvoiceRequest) {
    return this.service.delete(
      Number(id),
      this.getUserId(req),
      this.getIpAddress(req),
    );
  }
}
