import {
  Controller, Post, Get, Body, Query, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CsvImportService } from './csv-import.service';

@Controller('csv-import')
@UseGuards(AuthGuard('jwt'))
export class CsvImportController {
  constructor(private readonly service: CsvImportService) {}

  @Get('template')
  getTemplate(@Query('module') module: string) {
    return this.service.getTemplate(module);
  }

  @Post('preview')
  preview(@Body() body: { module: string; csvData: string }) {
    return this.service.preview(body.module, body.csvData);
  }

  @Post('execute')
  execute(@Body() body: { module: string; rows: any[] }) {
    return this.service.execute(body.module, body.rows);
  }
}
