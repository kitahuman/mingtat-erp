import {
  Controller, Get, Post, Put, Delete,
  Body, Query, Param, ParseIntPipe, UseGuards, Request,
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { ExpensesService } from './expenses.service';
import { AuthGuard } from '@nestjs/passport';

const UPLOAD_DIR = join(process.cwd(), 'uploads', 'expenses');

@Controller('expenses')
@UseGuards(AuthGuard('jwt'))
export class ExpensesController {
  constructor(private readonly service: ExpensesService) {}

  // ── Expense CRUD ────────────────────────────────────────────────

  @Get()
  findAll(@Query() query: any) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: any, @Request() req: any) {
    return this.service.create(dto, req.user?.id || req.user?.userId || 0);
  }

  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: any, @Request() req: any) {
    return this.service.update(id, dto, req.user?.id || req.user?.userId || 0);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.service.remove(id, req.user?.id || req.user?.userId || 0);
  }

  // ── Expense Items ───────────────────────────────────────────────

  @Post(':id/items')
  createItem(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.service.createItem(id, dto);
  }

  @Put(':id/items/:itemId')
  updateItem(
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: any,
  ) {
    return this.service.updateItem(id, itemId, dto);
  }

  @Delete(':id/items/:itemId')
  removeItem(
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
  ) {
    return this.service.removeItem(id, itemId);
  }

  // ── Expense Attachments ─────────────────────────────────────────

  @Post(':id/attachments')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });
          cb(null, UPLOAD_DIR);
        },
        filename: (req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
          cb(null, `${unique}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
    }),
  )
  async uploadAttachment(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: any,
  ) {
    const fileUrl = `/uploads/expenses/${file.filename}`;
    return this.service.createAttachment(id, {
      file_name: Buffer.from(file.originalname, 'latin1').toString('utf8'),
      file_url: fileUrl,
      file_size: file.size,
      mime_type: file.mimetype,
    });
  }

  @Delete(':id/attachments/:attachmentId')
  removeAttachment(
    @Param('id', ParseIntPipe) id: number,
    @Param('attachmentId', ParseIntPipe) attachmentId: number,
  ) {
    return this.service.removeAttachment(id, attachmentId);
  }
}
