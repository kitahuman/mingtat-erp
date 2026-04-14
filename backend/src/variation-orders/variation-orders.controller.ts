import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { VariationOrdersService } from './variation-orders.service';
import { CreateVariationOrderDto, UpdateVariationOrderDto } from './dto/create-variation-order.dto';

@Controller('contracts/:contractId/variation-orders')
@UseGuards(AuthGuard('jwt'))
export class VariationOrdersController {
  constructor(private readonly service: VariationOrdersService) {}

  @Get()
  findAll(@Param('contractId') contractId: string) {
    return this.service.findAll(Number(contractId));
  }

  @Post()
  create(@Param('contractId') contractId: string, @Body() dto: CreateVariationOrderDto) {
    return this.service.create(Number(contractId), dto);
  }

  @Get(':id')
  findOne(@Param('contractId') contractId: string, @Param('id') id: string) {
    return this.service.findOne(Number(contractId), Number(id));
  }

  @Put(':id')
  update(
    @Param('contractId') contractId: string,
    @Param('id') id: string,
    @Body() dto: UpdateVariationOrderDto,
  ) {
    return this.service.update(Number(contractId), Number(id), dto);
  }

  @Delete(':id')
  remove(@Param('contractId') contractId: string, @Param('id') id: string) {
    return this.service.remove(Number(contractId), Number(id));
  }
}

@Controller('contracts/:contractId/summary')
@UseGuards(AuthGuard('jwt'))
export class ContractSummaryController {
  constructor(private readonly service: VariationOrdersService) {}

  @Get()
  getSummary(@Param('contractId') contractId: string) {
    return this.service.getContractSummary(Number(contractId));
  }
}
