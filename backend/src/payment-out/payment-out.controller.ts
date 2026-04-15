import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PaymentOutService } from './payment-out.service';
import { CreatePaymentOutDto, UpdatePaymentOutDto } from './dto/create-payment-out.dto';

@Controller('payment-out')
@UseGuards(AuthGuard('jwt'))
export class PaymentOutController {
  constructor(private readonly service: PaymentOutService) {}

  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('expense_id') expense_id?: string,
    @Query('company_id') company_id?: string,
    @Query('payment_out_status') payment_out_status?: string,
    @Query('date_from') date_from?: string,
    @Query('date_to') date_to?: string,
  ) {
    return this.service.findAll({
      page: page ? +page : undefined,
      limit: limit ? +limit : undefined,
      expense_id: expense_id ? +expense_id : undefined,
      company_id: company_id ? +company_id : undefined,
      payment_out_status: payment_out_status || undefined,
      date_from,
      date_to,
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

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(+id);
  }
}
