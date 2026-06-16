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
import { PaymentInDeductionsService } from './payment-in-deductions.service';
import {
  CreatePaymentInDeductionDto,
  UpdatePaymentInDeductionDto,
} from './dto/payment-in-deduction.dto';

@Controller('payment-in-deductions')
@UseGuards(AuthGuard('jwt'))
export class PaymentInDeductionsController {
  constructor(private readonly service: PaymentInDeductionsService) {}

  @Get()
  listByPaymentIn(@Query('payment_in_id') paymentInId: string) {
    return this.service.listByPaymentIn(+paymentInId);
  }

  @Get('by-invoice/:invoiceId')
  listByInvoice(@Param('invoiceId') invoiceId: string) {
    return this.service.listByInvoice(+invoiceId);
  }

  @Post()
  create(@Body() body: CreatePaymentInDeductionDto) {
    return this.service.create(body);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: UpdatePaymentInDeductionDto) {
    return this.service.update(+id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(+id);
  }
}
