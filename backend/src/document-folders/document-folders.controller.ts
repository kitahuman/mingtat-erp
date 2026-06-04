import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { DocumentFoldersService } from './document-folders.service';
import { CreateDocumentFolderDto, UpdateDocumentFolderDto } from './dto/document-folder.dto';

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

@Controller('document-folders')
@UseGuards(AuthGuard('jwt'))
export class DocumentFoldersController {
  constructor(private readonly service: DocumentFoldersService) {}

  @Post()
  create(@Body() dto: CreateDocumentFolderDto, @Req() req: AuthenticatedRequest) {
    const userId = normalizeOptionalUserId(req.user?.id ?? req.user?.userId ?? req.user?.sub);
    return this.service.create(dto, userId);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDocumentFolderDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
