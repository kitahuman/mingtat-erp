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
import { PaymentOutAllocationService } from './payment-out-allocation.service';
import {
  AllocationSearchQueryDto,
  CreatePaymentOutAllocationDto,
  UpdatePaymentOutAllocationDto,
} from './dto/payment-out-allocation.dto';

@Controller('payment-out-allocations')
@UseGuards(AuthGuard('jwt'))
export class PaymentOutAllocationController {
  constructor(private readonly service: PaymentOutAllocationService) {}

  /** Search documents that can still receive an allocation. */
  @Get('search')
  search(@Query() query: AllocationSearchQueryDto) {
    return this.service.searchCandidates(query);
  }

  /** List allocations attached to a specific PaymentOut. */
  @Get('by-payment-out/:paymentOutId')
  listByPaymentOut(@Param('paymentOutId') paymentOutId: string) {
    return this.service.listByPaymentOut(+paymentOutId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(+id);
  }

  @Post()
  create(@Body() body: CreatePaymentOutAllocationDto) {
    return this.service.create(body);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() body: UpdatePaymentOutAllocationDto,
  ) {
    return this.service.update(+id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(+id);
  }
}
