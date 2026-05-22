import { BadRequestException, Body, Controller, Get, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { createReadStream } from 'fs';
import { extname, basename } from 'path';
import archiver from 'archiver';
import { DocumentManagementService, ResolvedFile } from './document-management.service';
import {
  BatchDownloadDocumentsDto,
  DocumentFileParamsDto,
  ListDocumentManagementQueryDto,
} from './dto/document-management.dto';

@Controller('document-management')
@UseGuards(AuthGuard('jwt'))
export class DocumentManagementController {
  constructor(private readonly service: DocumentManagementService) {}

  @Get()
  list(@Query() query: ListDocumentManagementQueryDto) {
    return this.service.list(query);
  }

  @Post('batch-download')
  async batchDownload(@Body() dto: BatchDownloadDocumentsDto, @Res() res: Response) {
    const files = dto.files || [];
    if (!files.length) throw new BadRequestException('請選擇至少一個文件');
    if (files.length > 200) throw new BadRequestException('一次最多只能下載 200 個文件');

    const resolvedFiles: ResolvedFile[] = [];
    for (const item of files) {
      resolvedFiles.push(this.service.ensureFileExists(await this.service.resolveFile(item.source, decodeURIComponent(item.id))));
    }

    const archive = archiver('zip', { zlib: { level: 9 } });
    const zipName = `文件管理批量下載-${new Date().toISOString().slice(0, 10)}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(zipName)}`);

    archive.on('error', (error) => {
      if (!res.headersSent) {
        res.status(500).json({ message: '建立 ZIP 檔案失敗' });
        return;
      }
      res.destroy(error);
    });

    archive.pipe(res);

    const usedNames = new Map<string, number>();
    for (const file of resolvedFiles) {
      archive.file(file.filePath, { name: this.uniqueZipEntryName(file.fileName, usedNames) });
    }

    await archive.finalize();
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

  private uniqueZipEntryName(fileName: string, usedNames: Map<string, number>) {
    const sanitized = this.sanitizeZipEntryName(fileName || '未命名文件');
    const currentCount = usedNames.get(sanitized) || 0;
    usedNames.set(sanitized, currentCount + 1);
    if (currentCount === 0) return sanitized;

    const extension = extname(sanitized);
    const base = extension ? basename(sanitized, extension) : sanitized;
    return `${base} (${currentCount + 1})${extension}`;
  }

  private sanitizeZipEntryName(fileName: string) {
    return fileName
      .replace(/[\\/]/g, '_')
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .trim()
      || '未命名文件';
  }
}
