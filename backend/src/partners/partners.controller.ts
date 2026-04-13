import { Controller, Get, Post, Put, Delete, Param, Query, Body, UseGuards , Request} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PartnersService } from './partners.service';

@Controller('partners')
@UseGuards(AuthGuard('jwt'))
export class PartnersController {
  constructor(private readonly service: PartnersService) {}

  @Get()
  findAll(@Query() query: any) {
    return this.service.findAll(query);
  }

  @Get('simple')
  simple() {
    return this.service.simple();
  }

  @Get(':id')
  findOne(@Param('id') id: number) {
    return this.service.findOne(Number(id));
  }

  @Post()
  create(@Body() dto: any, @Request() req: any) {
    return this.service.create(dto, req.user?.id || req.user?.userId || 0, req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.ip || undefined);
  }

  @Post('bulk')
  bulkCreate(@Body() dtos: any[]) {
    return this.service.bulkCreate(dtos);
  }

  @Put(':id')
  update(@Param('id') id: number, @Body() dto: any, @Request() req: any) {
    return this.service.update(Number(id), dto, req.user?.id || req.user?.userId || 0);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  remove(@Param('id') id: string, @Request() req: any) {
    return this.service.remove(Number(id), req.user?.id || req.user?.userId || 0, req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.ip || undefined);
  }

}