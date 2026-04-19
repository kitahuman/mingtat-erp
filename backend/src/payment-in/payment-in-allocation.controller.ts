import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PaymentInAllocationService } from './payment-in-allocation.service';
import {
  CreatePaymentInAllocationDto,
  PaymentInAllocationSearchQueryDto,
  UpdatePaymentInAllocationDto,
} from './dto/payment-in-allocation.dto';

@Controller('payment-in-allocations')
@UseGuards(AuthGuard('jwt'))
export class PaymentInAllocationController {
  constructor(private readonly service: PaymentInAllocationService) {}

  /** Search documents (Invoice) that can still receive an allocation. */
  @Get('search')
  search(@Query() query: PaymentInAllocationSearchQueryDto) {
    return this.service.searchCandidates(query);
  }

  /** List allocations attached to a specific PaymentIn. */
  @Get('by-payment-in/:paymentInId')
  listByPaymentIn(@Param('paymentInId') paymentInId: string) {
    return this.service.listByPaymentIn(+paymentInId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(+id);
  }

  @Post()
  create(@Body() body: CreatePaymentInAllocationDto) {
    return this.service.create(body);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() body: UpdatePaymentInAllocationDto,
  ) {
    return this.service.update(+id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(+id);
  }
}
