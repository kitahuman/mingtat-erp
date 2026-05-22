import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { createReadStream, existsSync, mkdirSync } from 'fs';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { AttachmentsService } from './attachments.service';
import {
  ATTACHMENT_ENTITY_TYPES,
  AttachmentEntityParamsDto,
  AttachmentEntityType,
  CreateAttachmentDto,
  ListAttachmentsQueryDto,
  UpdateAttachmentDto,
} from './dto/attachment.dto';

function isAttachmentEntityType(entityType: string): entityType is AttachmentEntityType {
  return (ATTACHMENT_ENTITY_TYPES as readonly string[]).includes(entityType);
}

function getAttachmentUploadDir(entityType: AttachmentEntityType) {
  const dir = join(process.cwd(), 'uploads', 'attachments', entityType);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

interface JwtUser {
  id?: number;
  userId?: number;
  sub?: number | string;
}

interface AuthenticatedRequest extends Request {
  user?: JwtUser;
}

function normalizeOptionalUserId(value: number | string | undefined): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string') return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

@Controller('attachments')
@UseGuards(AuthGuard('jwt'))
export class AttachmentsController {
  constructor(private readonly service: AttachmentsService) {}

  @Get()
  findByEntity(@Query() query: ListAttachmentsQueryDto) {
    return this.service.findByEntity(query.entity_type, Number(query.entity_id));
  }

  @Post(':entityType/:entityId/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, _file, cb) => {
          const entityType = String(req.params.entityType);
          if (!isAttachmentEntityType(entityType)) {
            return cb(new BadRequestException('不支援的附件關聯類型'), '');
          }
          cb(null, getAttachmentUploadDir(entityType));
        },
        filename: (_req, file, cb) => {
          const decodedName = Buffer.from(file.originalname, 'latin1').toString('utf8');
          const ext = extname(decodedName || file.originalname);
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
      limits: { fileSize: 100 * 1024 * 1024 },
    }),
  )
  upload(
    @Param() params: AttachmentEntityParamsDto,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CreateAttachmentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    if (!file) throw new BadRequestException('請選擇文件');
    const userId = normalizeOptionalUserId(req.user?.id ?? req.user?.userId ?? req.user?.sub);
    return this.service.create(
      params.entityType,
      Number(params.entityId),
      file,
      dto,
      userId,
    );
  }

  @Get(':id/download')
  async download(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    return this.streamFile(id, res, 'attachment');
  }

  @Get(':id/preview')
  async preview(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    return this.streamFile(id, res, 'inline');
  }

  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAttachmentDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }

  private async streamFile(
    id: number,
    res: Response,
    dispositionType: 'attachment' | 'inline',
  ) {
    const attachment = await this.service.findOne(id);
    const filePath = this.service.getDiskPath(attachment.attachment_file_path);
    if (!existsSync(filePath)) {
      return res.status(404).json({ message: '文件不存在' });
    }

    const encodedName = encodeURIComponent(attachment.attachment_filename);
    res.setHeader(
      'Content-Disposition',
      `${dispositionType}; filename="${encodedName}"; filename*=UTF-8''${encodedName}`,
    );
    res.setHeader('Content-Type', attachment.attachment_mime_type || 'application/octet-stream');
    return createReadStream(filePath).pipe(res);
  }
}
