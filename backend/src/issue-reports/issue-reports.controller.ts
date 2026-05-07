import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { IssueReportsService } from './issue-reports.service';
import { CreateIssueReportDto } from './issue-reports.dto';

const ALLOWED_SCREENSHOT_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
const ALLOWED_SCREENSHOT_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

@Controller('issue-reports')
@UseGuards(AuthGuard('jwt'))
export class IssueReportsController {
  constructor(private readonly service: IssueReportsService) {}

  @Post('upload-screenshot')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: (_req, _file, cb) => cb(null, IssueReportsService.ensureScreenshotUploadDir()),
      filename: (_req, file, cb) => cb(null, IssueReportsService.createScreenshotFilename(file.originalname)),
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const ext = extname(file.originalname).toLowerCase();
      if (ALLOWED_SCREENSHOT_MIME_TYPES.has(file.mimetype) && ALLOWED_SCREENSHOT_EXTENSIONS.has(ext)) {
        cb(null, true);
        return;
      }
      cb(new BadRequestException('只接受 jpg、jpeg、png、gif、webp 圖片，每張最多 5MB') as any, false);
    },
  }))
  uploadScreenshot(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('請上傳截圖圖片');
    }
    return this.service.toScreenshotUploadResponse(file);
  }

  @Post()
  create(@Body() dto: CreateIssueReportDto, @Req() req: any) {
    return this.service.create(dto, req.user || {});
  }

  @Get()
  findAll(@Req() req: any, @Query('limit') limit?: string) {
    const n = limit ? Number(limit) : 50;
    return this.service.findAll(req.user || {}, Number.isFinite(n) ? n : 50);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.service.findOne(id, req.user || {});
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: 'open' | 'acknowledged' | 'resolved',
  ) {
    return this.service.updateStatus(id, status);
  }
}
