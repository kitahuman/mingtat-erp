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
import { PaymentOutService } from './payment-out.service';
import { CreatePaymentOutDto, UpdatePaymentOutDto, UpdatePaymentOutStatusDto } from './dto/create-payment-out.dto';

@Controller('payment-out')
@UseGuards(AuthGuard('jwt'))
export class PaymentOutController {
  constructor(private readonly service: PaymentOutService) {}

  @Get('filter-options')
  getFilterOptions(@Query('column') column: string) {
    return this.service.getFilterOptions(column);
  }

  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('expense_id') expense_id?: string,
    @Query('subcon_payroll_id') subcon_payroll_id?: string,
    @Query('company_id') company_id?: string,
    @Query('payment_out_status') payment_out_status?: string,
    @Query('date_from') date_from?: string,
    @Query('date_to') date_to?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
    @Query('filter_payment_out_status') filter_payment_out_status?: string,
    @Query('filter_company') filter_company?: string,
    @Query('filter_payment_method') filter_payment_method?: string,
    @Query('filter_bank_account_id') filter_bank_account_id?: string,
  ) {
    return this.service.findAll({
      page: page ? +page : undefined,
      limit: limit ? +limit : undefined,
      expense_id: expense_id ? +expense_id : undefined,
      subcon_payroll_id: subcon_payroll_id ? +subcon_payroll_id : undefined,
      company_id: company_id ? +company_id : undefined,
      payment_out_status: payment_out_status || undefined,
      date_from,
      date_to,
      sortBy,
      sortOrder,
      filter_payment_out_status,
      filter_company,
      filter_payment_method,
      filter_bank_account_id,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(+id);
  }

  @Post()
  create(@Body() body: CreatePaymentOutDto) {
    return this.service.create(body);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: UpdatePaymentOutDto) {
    return this.service.update(+id, body);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() body: UpdatePaymentOutStatusDto) {
    return this.service.updateStatus(+id, body.payment_out_status);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(+id);
  }
}
