import { Controller, Get, Put, Delete, Post, Param, Body, Query, ParseIntPipe, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { LeavesService } from './leaves.service';

@Controller('leaves')
@UseGuards(AuthGuard('jwt'))
export class LeavesController {
  constructor(private readonly service: LeavesService) {}

  @Get()
  findAll(@Query() query: any) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: any, @Request() req: any) {
    return this.service.update(id, dto, req.user?.id || req.user?.userId || 0);
  }

  @Post(':id/approve')
  approve(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.service.approve(id, req.user.sub);
  }

  @Post(':id/reject')
  reject(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: any,
    @Body() body: { remarks?: string },
  ) {
    return this.service.reject(id, req.user.sub, body.remarks);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.service.remove(id, req.user?.id || req.user?.userId || 0);
  }
}
