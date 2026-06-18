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
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PaymentInService } from './payment-in.service';
import { CreatePaymentInDto, UpdatePaymentInDto, UpdatePaymentInStatusDto } from './dto/create-payment-in.dto';

@Controller('payment-in')
@UseGuards(AuthGuard('jwt'))
export class PaymentInController {
  constructor(private readonly service: PaymentInService) {}

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
