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
import type { Response } from 'express';
import { QuotationsService } from './quotations.service';
import { QuotationPdfService } from './quotation-pdf.service';
import type { QuotationPdfLanguage } from './quotation-pdf.service';
import {
  AcceptQuotationDto,
  CreateQuotationDto,
  CreateQuotationRevisionDto,
  SyncQuotationToRateCardsDto,
  UpdateQuotationDto,
} from './dto/create-quotation.dto';

type AuthenticatedRequest = {
  user?: { id?: number; userId?: number };
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
};

type QuotationListQuery = {
  page?: number | string;
  limit?: number | string;
  search?: string;
  company_id?: number | string;
  client_id?: number | string;
  status?: string;
  quotation_type?: string;
  sortBy?: string;
  sortOrder?: string;
  [key: string]: string | number | undefined;
};

function getUserId(req: AuthenticatedRequest): number {
  return req.user?.id || req.user?.userId || 0;
}

function getIpAddress(req: AuthenticatedRequest): string | undefined {
  const forwarded = req.headers['x-forwarded-for'];
  const forwardedValue = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return forwardedValue?.split(',')[0]?.trim() || req.ip || undefined;
}

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
    @Res({ passthrough: true }) res: Response,
  ) {
    const pdf = await this.quotationPdfService.generateQuotationPdf(
      Number(id),
      {
        language,
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
      },
    );

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
    @Res({ passthrough: true }) res: Response,
  ) {
    const html = await this.quotationPdfService.generateQuotationHtml(
      Number(id),
      {
        language,
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
      },
    );

    res.set({
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    return html;
  }

  @Get()
  findAll(@Query() query: QuotationListQuery) {
    return this.service.findAll(query);
  }

  @Get('filter-options/:column')
  getFilterOptions(
    @Param('column') column: string,
    @Query() query: QuotationListQuery,
  ) {
    return this.service.getFilterOptions(column, query);
  }

  @Get('by-project/:projectId')
  findByProject(@Param('projectId') projectId: number) {
    return this.service.findByProject(Number(projectId));
  }

  @Get(':id/revisions')
  getRevisions(@Param('id') id: number) {
    return this.service.getRevisions(Number(id));
  }

  @Get(':id')
  findOne(@Param('id') id: number) {
    return this.service.findOne(Number(id));
  }

  @Post()
  create(
    @Body() dto: CreateQuotationDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.service.create(dto, getUserId(req), getIpAddress(req));
  }

  @Post(':id/revision')
  createRevision(
    @Param('id') id: number,
    @Body() dto: CreateQuotationRevisionDto,
  ) {
    return this.service.createRevision(Number(id), dto);
  }

  @Put(':id')
  update(
    @Param('id') id: number,
    @Body() dto: UpdateQuotationDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.service.update(Number(id), dto, getUserId(req));
  }

  @Patch(':id/set-active')
  setActive(@Param('id') id: number) {
    return this.service.setActive(Number(id));
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: number, @Body('status') status: string) {
    return this.service.updateStatus(Number(id), status);
  }

  @Post(':id/accept')
  acceptQuotation(
    @Param('id') id: number,
    @Body() options: AcceptQuotationDto,
  ) {
    return this.service.acceptQuotation(Number(id), options);
  }

  @Post(':id/sync-to-rate-cards')
  syncToRateCards(
    @Param('id') id: number,
    @Body() options: SyncQuotationToRateCardsDto,
  ) {
    return this.service.syncToRateCards(Number(id), options);
  }

  @Delete(':id')
  remove(@Param('id') id: number, @Request() req: AuthenticatedRequest) {
    return this.service.remove(Number(id), getUserId(req), getIpAddress(req));
  }
}
