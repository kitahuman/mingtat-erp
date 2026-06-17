import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PaymentInSourceTypeService } from './payment-in-source-type.service';
import {
  CreatePaymentInSourceTypeDto,
  UpdatePaymentInSourceTypeDto,
} from './dto/payment-in-source-type.dto';

@Controller('settings/payment-in-source-types')
@UseGuards(AuthGuard('jwt'))
export class PaymentInSourceTypeController {
  constructor(private readonly service: PaymentInSourceTypeService) {}

  @Get()
  findAll(@Query('include_inactive') includeInactive?: string) {
    return this.service.findAll(includeInactive === 'true');
  }

  @Post()
  create(@Body() dto: CreatePaymentInSourceTypeDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePaymentInSourceTypeDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
