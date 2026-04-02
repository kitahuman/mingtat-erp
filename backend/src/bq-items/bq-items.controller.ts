import { Controller, Get, Post, Put, Delete, Param, Query, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { BqItemsService } from './bq-items.service';

@Controller('contracts/:contractId/bq-items')
@UseGuards(AuthGuard('jwt'))
export class BqItemsController {
  constructor(private readonly service: BqItemsService) {}

  @Get()
  findAll(
    @Param('contractId') contractId: string,
    @Query('sectionId') sectionId?: string,
  ) {
    return this.service.findAll(
      Number(contractId),
      sectionId !== undefined ? Number(sectionId) : undefined,
    );
  }

  @Post()
  create(@Param('contractId') contractId: string, @Body() dto: any) {
    return this.service.create(Number(contractId), dto);
  }

  @Put('reorder')
  reorder(@Param('contractId') contractId: string, @Body() body: { orderedIds: number[] }) {
    return this.service.reorder(Number(contractId), body.orderedIds);
  }

  @Post('batch')
  batchCreate(@Param('contractId') contractId: string, @Body() body: { items: any[] }) {
    return this.service.batchCreate(Number(contractId), body.items);
  }

  @Put(':id')
  update(
    @Param('contractId') contractId: string,
    @Param('id') id: string,
    @Body() dto: any,
  ) {
    return this.service.update(Number(contractId), Number(id), dto);
  }

  @Delete(':id')
  remove(@Param('contractId') contractId: string, @Param('id') id: string) {
    return this.service.remove(Number(contractId), Number(id));
  }
}
