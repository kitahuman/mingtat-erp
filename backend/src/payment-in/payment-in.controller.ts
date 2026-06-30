import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { PaymentInService } from './payment-in.service';
import { CreatePaymentInDto, UpdatePaymentInDto, UpdatePaymentInStatusDto } from './dto/create-payment-in.dto';
import { ReceiptPdfService } from './receipt-pdf.service';
import type { ReceiptPdfLanguage, ReceiptPdfOptions } from './receipt-pdf.service';

@Controller('payment-in')
@UseGuards(AuthGuard('jwt'))
export class PaymentInController {
  constructor(
    private readonly service: PaymentInService,
    private readonly receiptPdfService: ReceiptPdfService,
  ) {}

  private parseBool(value: string | undefined): boolean | undefined {
    return value === undefined
      ? undefined
      : !['false', '0', 'no'].includes(String(value).toLowerCase());
  }

  @Get('filter-options')
  getFilterOptions(@Query('column') column: string) {
    return this.service.getFilterOptions(column);
  }

  @Get('by-invoice/:invoiceId')
  findByInvoiceId(@Param('invoiceId') invoiceId: string) {
    return this.service.findByInvoiceId(+invoiceId);
  }

  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('source_type') source_type?: string,
    @Query('source_ref_id') source_ref_id?: string,
    @Query('project_id') project_id?: string,
    @Query('contract_id') contract_id?: string,
    @Query('payment_in_status') payment_in_status?: string,
    @Query('date_from') date_from?: string,
    @Query('date_to') date_to?: string,
    @Query('created_from') created_from?: string,
    @Query('created_to') created_to?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
    @Query('filter_payment_in_status') filter_payment_in_status?: string,
    @Query('filter_source_type') filter_source_type?: string,
    @Query('filter_company') filter_company?: string,
    @Query('filter_payment_method') filter_payment_method?: string,
    @Query('filter_bank_account_id') filter_bank_account_id?: string,
    @Query('filter_reference_no') filter_reference_no?: string,
    @Query('filter_remarks') filter_remarks?: string,
    @Query('filter_amount_min') filter_amount_min?: string,
    @Query('filter_amount_max') filter_amount_max?: string,
  ) {
    return this.service.findAll({
      page: page ? +page : undefined,
      limit: limit ? +limit : undefined,
      source_type,
      source_ref_id: source_ref_id ? +source_ref_id : undefined,
      project_id: project_id ? +project_id : undefined,
      contract_id: contract_id ? +contract_id : undefined,
      payment_in_status,
      date_from,
      date_to,
      created_from,
      created_to,
      sortBy,
      sortOrder,
      filter_payment_in_status,
      filter_source_type,
      filter_company,
      filter_payment_method,
      filter_bank_account_id,
      filter_reference_no,
      filter_remarks,
      filter_amount_min,
      filter_amount_max,
    });
  }

  // ── Receipt PDF endpoints ──────────────────────────────────────

  /**
   * GET /payment-in/:id/receipt-pdf
   * Generate and download receipt PDF
   */
  @Get(':id/receipt-pdf')
  async exportReceiptPdf(
    @Param('id') id: string,
    @Query('language') language: ReceiptPdfLanguage,
    @Query('show_client_address') showClientAddress: string,
    @Query('show_client_phone') showClientPhone: string,
    @Query('show_client_contact') showClientContact: string,
    @Query('show_client_signature') showClientSignature: string,
    @Query('show_company_signature') showCompanySignature: string,
    @Query('show_company_stamp') showCompanyStamp: string,
    @Query('client_name') clientName: string,
    @Query('description') description: string,
    @Query('show_invoice_items') showInvoiceItems: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const options: ReceiptPdfOptions = {
      language,
      showClientAddress: this.parseBool(showClientAddress),
      showClientPhone: this.parseBool(showClientPhone),
      showClientContact: this.parseBool(showClientContact),
      showClientSignature: this.parseBool(showClientSignature),
      showCompanySignature: this.parseBool(showCompanySignature),
      showCompanyStamp: this.parseBool(showCompanyStamp),
      overrideClientName: clientName,
      description,
      showInvoiceItems: this.parseBool(showInvoiceItems),
    };

    const { pdf, receiptNo } = await this.receiptPdfService.generateReceiptPdf(
      +id,
      options,
    );

    const rawFilename = `${receiptNo}.pdf`;
    const encodedFilename = encodeURIComponent(rawFilename);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodedFilename}; filename="${encodedFilename}"`,
      'Content-Length': pdf.length,
    });
    return new StreamableFile(pdf);
  }

  /**
   * GET /payment-in/:id/receipt-html
   * Return receipt HTML for iframe preview
   */
  @Get(':id/receipt-html')
  async previewReceiptHtml(
    @Param('id') id: string,
    @Query('language') language: ReceiptPdfLanguage,
    @Query('show_client_address') showClientAddress: string,
    @Query('show_client_phone') showClientPhone: string,
    @Query('show_client_contact') showClientContact: string,
    @Query('show_client_signature') showClientSignature: string,
    @Query('show_company_signature') showCompanySignature: string,
    @Query('show_company_stamp') showCompanyStamp: string,
    @Query('client_name') clientName: string,
    @Query('description') description: string,
    @Query('show_invoice_items') showInvoiceItems: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const options: ReceiptPdfOptions = {
      language,
      showClientAddress: this.parseBool(showClientAddress),
      showClientPhone: this.parseBool(showClientPhone),
      showClientContact: this.parseBool(showClientContact),
      showClientSignature: this.parseBool(showClientSignature),
      showCompanySignature: this.parseBool(showCompanySignature),
      showCompanyStamp: this.parseBool(showCompanyStamp),
      overrideClientName: clientName,
      description,
      showInvoiceItems: this.parseBool(showInvoiceItems),
    };

    const html = await this.receiptPdfService.generateReceiptHtml(+id, options);
    res.set({
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    return html;
  }

  /**
   * POST /payment-in/:id/receipt-options
   * Save receipt display preferences (and auto-generate receipt_no if needed)
   */
  @Post(':id/receipt-options')
  async saveReceiptOptions(
    @Param('id') id: string,
    @Body() body: ReceiptPdfOptions,
  ) {
    // Ensure receipt_no is generated
    const receiptNo = await this.receiptPdfService.ensureReceiptNo(+id);
    // Save options
    await this.receiptPdfService.saveReceiptOptions(+id, body);
    return { success: true, receipt_no: receiptNo };
  }

  /**
   * POST /payment-in/:id/ensure-receipt-no
   * Auto-generate receipt_no if not yet assigned; returns the receipt_no
   */
  @Post(':id/ensure-receipt-no')
  async ensureReceiptNo(@Param('id') id: string) {
    const receiptNo = await this.receiptPdfService.ensureReceiptNo(+id);
    return { receipt_no: receiptNo };
  }

  // ── Standard CRUD ─────────────────────────────────────────────

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(+id);
  }

  @Post()
  create(@Body() body: CreatePaymentInDto) {
    return this.service.create(body);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: UpdatePaymentInDto) {
    return this.service.update(+id, body);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() body: UpdatePaymentInStatusDto) {
    return this.service.updateStatus(+id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(+id);
  }
}
