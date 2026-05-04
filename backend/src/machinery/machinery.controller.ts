import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards , Request} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MachineryService } from './machinery.service';
import { CreateMachineryDto, UpdateMachineryDto, TransferMachineryDto } from './dto/create-machinery.dto';

@Controller('machinery')
@UseGuards(AuthGuard('jwt'))
export class MachineryController {
  constructor(private service: MachineryService) {}

  @Get('simple')
  simple() {
    return this.service.simple();
  }

  @Get()
  findAll(@Query() query: any) {
    return this.service.findAll(query);
  }

  @Get('filter-options/:column')
  getFilterOptions(@Param('column') column: string, @Query() query: any) {
    return this.service.getFilterOptions(column, query);
  }

  @Get(':id')
  findOne(@Param('id') id: number) {
    return this.service.findOne(+id);
  }

  @Post()
  create(@Body() dto: CreateMachineryDto, @Request() req: any) {
    return this.service.create(dto, req.user?.id || req.user?.userId || 0, req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.ip || undefined);
  }

  @Put(':id')
  update(@Param('id') id: number, @Body() dto: UpdateMachineryDto, @Request() req: any) {
    return this.service.update(+id, dto, req.user?.id || req.user?.userId || 0, req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.ip || undefined);
  }

  @Post(':id/transfer')
  transferMachinery(@Param('id') id: number, @Body() dto: TransferMachineryDto, @Request() req: any) {
    return this.service.transferMachinery(+id, dto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  remove(@Param('id') id: string, @Request() req: any) {
    return this.service.remove(Number(id), req.user?.id || req.user?.userId || 0, req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.ip || undefined);
  }

}