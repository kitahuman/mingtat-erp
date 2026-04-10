import { Controller, Get, Post, Delete, Query, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RecycleBinService } from './recycle-bin.service';

@Controller('recycle-bin')
@UseGuards(AuthGuard('jwt'))
export class RecycleBinController {
  constructor(private service: RecycleBinService) {}

  @Get()
  async findDeleted(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('table') table?: string,
  ) {
    return this.service.findDeleted({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      table,
    });
  }

  @Post('restore')
  async restore(
    @Body() body: { table: string; id: number },
  ) {
    return this.service.restore(body.table, body.id);
  }

  @Delete('permanent')
  async permanentDelete(
    @Body() body: { table: string; id: number },
  ) {
    return this.service.permanentDelete(body.table, body.id);
  }
}
