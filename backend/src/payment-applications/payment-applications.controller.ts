import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PaymentApplicationsService } from './payment-applications.service';

@Controller('contracts/:contractId/payment-applications')
@UseGuards(AuthGuard('jwt'))
export class PaymentApplicationsController {
  constructor(private readonly service: PaymentApplicationsService) {}

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

  // ── Create new IPA ──
  @Post()
  create(
    @Param('contractId') contractId: string,
    @Body() body: any,
  ) {
    return this.service.create(+contractId, body);
  }

  // ── Update IPA basic info ──
  @Put(':paId')
  update(
    @Param('contractId') contractId: string,
    @Param('paId') paId: string,
    @Body() body: any,
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
    @Body() body: any,
  ) {
    return this.service.addMaterial(+contractId, +paId, body);
  }

  @Put(':paId/materials/:materialId')
  updateMaterial(
    @Param('contractId') contractId: string,
    @Param('paId') paId: string,
    @Param('materialId') materialId: string,
    @Body() body: any,
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
    @Body() body: any,
  ) {
    return this.service.addDeduction(+contractId, +paId, body);
  }

  @Put(':paId/deductions/:deductionId')
  updateDeduction(
    @Param('contractId') contractId: string,
    @Param('paId') paId: string,
    @Param('deductionId') deductionId: string,
    @Body() body: any,
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
    @Body() body: any,
  ) {
    return this.service.certify(+contractId, +paId, body);
  }

  @Post(':paId/record-payment')
  recordPayment(
    @Param('contractId') contractId: string,
    @Param('paId') paId: string,
    @Body() body: any,
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
