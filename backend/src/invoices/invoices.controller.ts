import { Controller, Get, Post, Put, Patch, Delete, Param, Query, Body, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto, UpdateInvoiceDto, RecordPaymentDto } from './dto/create-invoice.dto';

@Controller('invoices')
@UseGuards(AuthGuard('jwt'))
export class InvoicesController {
  constructor(private readonly service: InvoicesService) {}

  @Get()
  findAll(@Query() query: any) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: number) {
    return this.service.findOne(Number(id));
  }

  @Post()
  create(@Body() dto: CreateInvoiceDto, @Request() req: any) {
    return this.service.create(dto, req.user?.id || req.user?.userId || 0, req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.ip || undefined);
  }

  @Post('from-quotation/:quotationId')
  createFromQuotation(@Param('quotationId') quotationId: number, @Body() dto: CreateInvoiceDto, @Request() req: any) {
    return this.service.createFromQuotation(Number(quotationId), dto, req.user?.id || req.user?.userId || 0);
  }

  @Put(':id')
  update(@Param('id') id: number, @Body() dto: UpdateInvoiceDto, @Request() req: any) {
    return this.service.update(Number(id), dto, req.user?.id || req.user?.userId || 0);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: number, @Body('status') status: string) {
    return this.service.updateStatus(Number(id), status);
  }

  @Post(':id/record-payment')
  recordPayment(@Param('id') id: number, @Body() dto: RecordPaymentDto) {
    return this.service.recordPayment(Number(id), dto);
  }

  @Delete(':id/payment/:paymentId')
  deletePayment(@Param('id') id: number, @Param('paymentId') paymentId: number) {
    return this.service.deletePayment(Number(id), Number(paymentId));
  }

  @Get(':id/payments')
  getPayments(@Param('id') id: number) {
    return this.service.getPayments(Number(id));
  }

  @Delete(':id')
  remove(@Param('id') id: number, @Request() req: any) {
    return this.service.delete(Number(id), req.user?.id || req.user?.userId || 0, req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.ip || undefined);
  }
}
