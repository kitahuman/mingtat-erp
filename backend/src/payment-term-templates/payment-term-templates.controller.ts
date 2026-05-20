import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PaymentTermTemplatesService } from './payment-term-templates.service';
import {
  CreatePaymentTermTemplateDto,
  UpdatePaymentTermTemplateDto,
} from './dto/payment-term-template.dto';

@Controller('payment-term-templates')
@UseGuards(AuthGuard('jwt'))
export class PaymentTermTemplatesController {
  constructor(private readonly service: PaymentTermTemplatesService) {}

  @Get()
  findAll(
    @Query('company_id') companyId?: string,
    @Query('client_id') clientId?: string,
    @Query('all') all?: string,
  ) {
    return this.service.findAll({
      company_id: companyId ? Number(companyId) : undefined,
      client_id: clientId ? Number(clientId) : undefined,
      all: all === 'true' || all === '1',
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(+id);
  }

  @Post()
  create(@Body() body: CreatePaymentTermTemplateDto) {
    return this.service.create(body);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: UpdatePaymentTermTemplateDto) {
    return this.service.update(+id, body);
  }

  @Patch(':id')
  patch(@Param('id') id: string, @Body() body: UpdatePaymentTermTemplateDto) {
    return this.service.update(+id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(+id);
  }
}
