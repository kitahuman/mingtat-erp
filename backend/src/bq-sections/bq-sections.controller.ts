import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { BqSectionsService } from './bq-sections.service';

@Controller('contracts/:contractId/bq-sections')
@UseGuards(AuthGuard('jwt'))
export class BqSectionsController {
  constructor(private readonly service: BqSectionsService) {}

  @Get()
  findAll(@Param('contractId') contractId: string) {
    return this.service.findAll(Number(contractId));
  }

  @Post()
  create(@Param('contractId') contractId: string, @Body() dto: any) {
    return this.service.create(Number(contractId), dto);
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
