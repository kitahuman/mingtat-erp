import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { createReadStream } from 'fs';
import { DocumentManagementService } from './document-management.service';
import { DocumentFileParamsDto, ListDocumentManagementQueryDto } from './dto/document-management.dto';

@Controller('document-management')
@UseGuards(AuthGuard('jwt'))
export class DocumentManagementController {
  constructor(private readonly service: DocumentManagementService) {}

  @Get()
  list(@Query() query: ListDocumentManagementQueryDto) {
    return this.service.list(query);
  }

  @Get(':source/:id/preview')
  async preview(@Param() params: DocumentFileParamsDto, @Res() res: Response) {
    const file = this.service.ensureFileExists(await this.service.resolveFile(params.source, decodeURIComponent(params.id)));
    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
    createReadStream(file.filePath).pipe(res);
  }

  @Get(':source/:id/download')
  async download(@Param() params: DocumentFileParamsDto, @Res() res: Response) {
    const file = this.service.ensureFileExists(await this.service.resolveFile(params.source, decodeURIComponent(params.id)));
    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
    createReadStream(file.filePath).pipe(res);
  }
}
