import { Controller, Get, Post, Delete, Query, Body, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RecycleBinService } from './recycle-bin.service';

export class SoftDeleteDto {
  table!: string;
  id!: number;
}

export class RestoreDto {
  table!: string;
  id!: number;
}

export class PermanentDeleteDto {
  table!: string;
  id!: number;
}

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

  @Post('soft')
  async softDelete(
    @Body() body: SoftDeleteDto,
    @Request() req: { user: { id?: number; userId?: number; sub?: number } },
  ) {
    const userId = req.user?.id || req.user?.userId || req.user?.sub || undefined;
    return this.service.softDelete(body.table, body.id, userId);
  }

  @Post('restore')
  async restore(
    @Body() body: RestoreDto,
  ) {
    return this.service.restore(body.table, body.id);
  }

  @Delete('permanent')
  async permanentDelete(
    @Body() body: PermanentDeleteDto,
  ) {
    return this.service.permanentDelete(body.table, body.id);
  }
}
