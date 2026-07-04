import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { PaymentApplicationsService } from './payment-applications.service';
import { IpaPdfService } from './ipa-pdf.service';
import { IpaExcelService } from './ipa-excel.service';
import { CreatePaymentApplicationDto, UpdatePaymentApplicationDto, PaymentMaterialDto, PaymentDeductionDto, CertifyDto, RecordPaymentDto } from './dto/payment-application.dto';

@Controller('contracts/:contractId/payment-applications')
@UseGuards(AuthGuard('jwt'))
export class PaymentApplicationsController {
  constructor(
    private readonly service: PaymentApplicationsService,
    private readonly ipaPdfService: IpaPdfService,
    private readonly ipaExcelService: IpaExcelService,
  ) {}

  // ── List all IPAs for a contract ──
  @Get()
  findAll(@Param('contractId') contractId: string) {
    return this.service.findAll(+contractId);
  }

  // ── Get single IPA detail ──
  @Get(':paId')
  findOne(
    @Param('contractId') contractId: string,
    @Param('paId') paId: string,
  ) {
    return this.service.findOne(+contractId, +paId);
  }

  // ── Export IPA as PDF ──
  @Get(':paId/pdf')
  async exportPdf(
    @Param('contractId') contractId: string,
    @Param('paId') paId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { pdf, ipa } = await this.ipaPdfService.generateIpaPdf(
      +contractId,
      +paId,
    );
    const rawFilename = `${ipa.reference || `IPA-${ipa.pa_no}`}.pdf`;
    const encodedFilename = encodeURIComponent(rawFilename);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodedFilename}; filename="${encodedFilename}"`,
      'Content-Length': pdf.length,
    });
    return new StreamableFile(pdf);
  }

  // ── Export IPA as Excel ──
  @Get(':paId/excel')
  async exportExcel(
    @Param('contractId') contractId: string,
    @Param('paId') paId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { buffer, ipa } = await this.ipaExcelService.generateIpaExcel(
      +contractId,
      +paId,
    );
    const rawFilename = `${ipa.reference || `IPA-${ipa.pa_no}`}.xlsx`;
    const encodedFilename = encodeURIComponent(rawFilename);
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodedFilename}; filename="${encodedFilename}"`,
      'Content-Length': buffer.length,
    });
    return new StreamableFile(buffer);
  }

  // ── Create new IPA ──
  @Post()
  create(
    @Param('contractId') contractId: string,
    @Body() body: CreatePaymentApplicationDto,
  ) {
    return this.service.create(+contractId, body);
  }

  // ── Update IPA basic info ──
  @Put(':paId')
  update(
    @Param('contractId') contractId: string,
    @Param('paId') paId: string,
    @Body() body: UpdatePaymentApplicationDto,
  ) {
    return this.service.update(+contractId, +paId, body);
  }

  // ── Delete IPA (draft only) ──
  @Delete(':paId')
  remove(
    @Param('contractId') contractId: string,
    @Param('paId') paId: string,
  ) {
    return this.service.remove(+contractId, +paId);
  }

  // ── BQ Progress batch update ──
  @Put(':paId/bq-progress')
  updateBqProgress(
    @Param('contractId') contractId: string,
    @Param('paId') paId: string,
    @Body() body: { items: { bq_item_id: number; current_cumulative_qty: number }[] },
  ) {
    return this.service.updateBqProgress(+contractId, +paId, body.items);
  }

  // ── Delete single BQ Progress item ──
  @Delete(':paId/bq-progress/:progressId')
  removeBqProgress(
    @Param('contractId') contractId: string,
    @Param('paId') paId: string,
    @Param('progressId') progressId: string,
  ) {
    return this.service.removeBqProgress(+contractId, +paId, +progressId);
  }

  // ── VO Progress batch update ──
  @Put(':paId/vo-progress')
  updateVoProgress(
    @Param('contractId') contractId: string,
    @Param('paId') paId: string,
    @Body() body: { items: { vo_item_id: number; current_cumulative_qty: number }[] },
  ) {
    return this.service.updateVoProgress(+contractId, +paId, body.items);
  }

  // ── Materials CRUD ──
  @Post(':paId/materials')
  addMaterial(
    @Param('contractId') contractId: string,
    @Param('paId') paId: string,
    @Body() body: PaymentMaterialDto,
  ) {
    return this.service.addMaterial(+contractId, +paId, body);
  }

  @Put(':paId/materials/:materialId')
  updateMaterial(
    @Param('contractId') contractId: string,
    @Param('paId') paId: string,
    @Param('materialId') materialId: string,
    @Body() body: PaymentMaterialDto,
  ) {
    return this.service.updateMaterial(+contractId, +paId, +materialId, body);
  }

  @Delete(':paId/materials/:materialId')
  removeMaterial(
    @Param('contractId') contractId: string,
    @Param('paId') paId: string,
    @Param('materialId') materialId: string,
  ) {
    return this.service.removeMaterial(+contractId, +paId, +materialId);
  }

  // ── Deductions CRUD ──
  @Post(':paId/deductions')
  addDeduction(
    @Param('contractId') contractId: string,
    @Param('paId') paId: string,
    @Body() body: PaymentDeductionDto,
  ) {
    return this.service.addDeduction(+contractId, +paId, body);
  }

  @Put(':paId/deductions/:deductionId')
  updateDeduction(
    @Param('contractId') contractId: string,
    @Param('paId') paId: string,
    @Param('deductionId') deductionId: string,
    @Body() body: PaymentDeductionDto,
  ) {
    return this.service.updateDeduction(+contractId, +paId, +deductionId, body);
  }

  @Delete(':paId/deductions/:deductionId')
  removeDeduction(
    @Param('contractId') contractId: string,
    @Param('paId') paId: string,
    @Param('deductionId') deductionId: string,
  ) {
    return this.service.removeDeduction(+contractId, +paId, +deductionId);
  }

  // ── Status transitions ──
  @Post(':paId/submit')
  submit(
    @Param('contractId') contractId: string,
    @Param('paId') paId: string,
  ) {
    return this.service.submit(+contractId, +paId);
  }

  @Post(':paId/certify')
  certify(
    @Param('contractId') contractId: string,
    @Param('paId') paId: string,
    @Body() body: CertifyDto,
  ) {
    return this.service.certify(+contractId, +paId, body);
  }

  @Post(':paId/record-payment')
  recordPayment(
    @Param('contractId') contractId: string,
    @Param('paId') paId: string,
    @Body() body: RecordPaymentDto,
  ) {
    return this.service.recordPayment(+contractId, +paId, body);
  }

  @Post(':paId/revert')
  revert(
    @Param('contractId') contractId: string,
    @Param('paId') paId: string,
  ) {
    return this.service.revert(+contractId, +paId);
  }

  @Post(':paId/void')
  voidPa(
    @Param('contractId') contractId: string,
    @Param('paId') paId: string,
  ) {
    return this.service.void(+contractId, +paId);
  }

  // ── Contract retention settings ──
  @Put('retention')
  updateRetention(
    @Param('contractId') contractId: string,
    @Body() body: { retention_rate?: number; retention_cap_rate?: number },
  ) {
    return this.service.updateRetention(+contractId, body);
  }
}
