import { Controller, Get, Post, Put, Delete, Param, Query, Body, UseGuards, UseInterceptors, UploadedFile, Res } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentsService } from './documents.service';
import type { Response } from 'express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

function getUploadDir() {
  const dir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

@Controller('documents')
@UseGuards(AuthGuard('jwt'))
export class DocumentsController {
  constructor(private readonly service: DocumentsService) {}

  @Get()
  findByEntity(@Query('entity_type') entityType: string, @Query('entity_id') entityId: number) {
    return this.service.findByEntity(entityType, Number(entityId));
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: (_req, _file, cb) => cb(null, getUploadDir()),
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname);
        const name = uuidv4() + ext;
        cb(null, name);
      },
    }),
    limits: { fileSize: 20 * 1024 * 1024 },
  }))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body('entity_type') entityType: string,
    @Body('entity_id') entityId: string,
    @Body('doc_type') docType: string,
    @Body('expiry_date') expiryDate: string,
    @Body('notes') notes: string,
  ) {
    const doc = await this.service.create({
      entity_type: entityType,
      entity_id: Number(entityId),
      doc_type: docType,
      file_name: Buffer.from(file.originalname, 'latin1').toString('utf8'),
      file_path: file.filename,
      file_size: file.size,
      mime_type: file.mimetype,
      expiry_date: expiryDate || undefined,
      notes: notes || undefined,
    });
    return doc;
  }

  @Get(':id/download')
  async download(@Param('id') id: number, @Res() res: Response) {
    const doc = await this.service.findOne(Number(id));
    const filePath = path.join(getUploadDir(), doc.file_path);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: '文件不存在' });
    }
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.file_name)}"`);
    res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  }

  @Put(':id')
  update(@Param('id') id: number, @Body() dto: any) {
    return this.service.update(Number(id), dto);
  }

  @Delete(':id')
  remove(@Param('id') id: number) {
    return this.service.remove(Number(id));
  }
}
