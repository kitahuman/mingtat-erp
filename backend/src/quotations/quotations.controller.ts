import { Controller, Get, Post, Put, Patch, Delete, Param, Query, Body, UseGuards, Request, Res, StreamableFile } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { QuotationsService } from './quotations.service';
import { QuotationPdfService } from './quotation-pdf.service';
import type { QuotationPdfLanguage } from './quotation-pdf.service';
import { CreateQuotationDto, UpdateQuotationDto } from './dto/create-quotation.dto';

@Controller('quotations')
@UseGuards(AuthGuard('jwt'))
export class QuotationsController {
  constructor(
    private readonly service: QuotationsService,
    private readonly quotationPdfService: QuotationPdfService,
  ) {}

  private parseBool(value: string | undefined) {
    return value === undefined
      ? undefined
      : !['false', '0', 'no'].includes(String(value).toLowerCase());
  }

  @Get(':id/pdf')
  async exportPdf(
    @Param('id') id: number,
    @Query('language') language: QuotationPdfLanguage,
    @Query('show_signature') showSignature: string,
    @Query('override_payment_terms') overridePaymentTerms: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const pdf = await this.quotationPdfService.generateQuotationPdf(Number(id), {
      language,
      showSignature: this.parseBool(showSignature),
      overridePaymentTerms,
    });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="quotation-${Number(id)}.pdf"`,
      'Content-Length': pdf.length,
    });
    return new StreamableFile(pdf);
  }

  @Get(':id/pdf-html')
  async previewPdfHtml(
    @Param('id') id: number,
    @Query('language') language: QuotationPdfLanguage,
    @Query('show_signature') showSignature: string,
    @Query('override_payment_terms') overridePaymentTerms: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const html = await this.quotationPdfService.generateQuotationHtml(Number(id), {
      language,
      showSignature: this.parseBool(showSignature),
      overridePaymentTerms,
    });

    res.set({
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    return html;
  }

  @Get()
  findAll(@Query() query: any) {
    return this.service.findAll(query);
  }

  @Get('by-project/:projectId')
  findByProject(@Param('projectId') projectId: number) {
    return this.service.findByProject(Number(projectId));
  }

  @Get(':id')
  findOne(@Param('id') id: number) {
    return this.service.findOne(Number(id));
  }

  @Post()
  create(@Body() dto: CreateQuotationDto, @Request() req: any) {
    return this.service.create(dto, req.user?.id || req.user?.userId || 0, req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.ip || undefined);
  }

  @Put(':id')
  update(@Param('id') id: number, @Body() dto: UpdateQuotationDto, @Request() req: any) {
    return this.service.update(Number(id), dto, req.user?.id || req.user?.userId || 0);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: number, @Body('status') status: string) {
    return this.service.updateStatus(Number(id), status);
  }

  @Post(':id/accept')
  acceptQuotation(@Param('id') id: number, @Body() options: any) {
    return this.service.acceptQuotation(Number(id), options);
  }

  @Post(':id/sync-to-rate-cards')
  syncToRateCards(@Param('id') id: number, @Body() options: any) {
    return this.service.syncToRateCards(Number(id), options);
  }

  @Delete(':id')
  remove(@Param('id') id: number, @Request() req: any) {
    return this.service.remove(Number(id), req.user?.id || req.user?.userId || 0, req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.ip || undefined);
  }
}
