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
import { PaymentInService } from './payment-in.service';
import { CreatePaymentInDto, UpdatePaymentInDto } from './dto/create-payment-in.dto';

@Controller('payment-in')
@UseGuards(AuthGuard('jwt'))
export class PaymentInController {
  constructor(private readonly service: PaymentInService) {}

  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('source_type') source_type?: string,
    @Query('project_id') project_id?: string,
    @Query('contract_id') contract_id?: string,
    @Query('date_from') date_from?: string,
    @Query('date_to') date_to?: string,
  ) {
    return this.service.findAll({
      page: page ? +page : undefined,
      limit: limit ? +limit : undefined,
      source_type,
      project_id: project_id ? +project_id : undefined,
      contract_id: contract_id ? +contract_id : undefined,
      date_from,
      date_to,
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

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(+id);
  }
}
