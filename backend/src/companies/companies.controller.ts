import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { mkdirSync } from 'fs';
import { extname, join } from 'path';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto, UpdateCompanyDto } from './dto/create-company.dto';

@Controller('companies')
@UseGuards(AuthGuard('jwt'))
export class CompaniesController {
  constructor(private service: CompaniesService) {}

  @Get()
  findAll(@Query() query: any) {
    return this.service.findAll(query);
  }

  @Get('simple')
  findAllSimple() {
    return this.service.findAllSimple();
  }

  @Post(':id/stamp')
  @UseInterceptors(
    FileInterceptor('stamp', {
      storage: diskStorage({
        destination: (req, _file, cb) => {
          const companyId = String(req.params.id);
          const uploadDir = join(process.cwd(), 'uploads', 'companies', companyId);
          mkdirSync(uploadDir, { recursive: true });
          cb(null, uploadDir);
        },
        filename: (_req, file, cb) => {
          const originalExt = extname(file.originalname || '').toLowerCase();
          const mimeExt = file.mimetype === 'image/png'
            ? '.png'
            : file.mimetype === 'image/webp'
              ? '.webp'
              : file.mimetype === 'image/gif'
                ? '.gif'
                : '.jpg';
          cb(null, `stamp${originalExt || mimeExt}`);
        },
      }),
      fileFilter: (_req, file, cb) => {
        if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.mimetype)) {
          return cb(new BadRequestException('只支援 PNG、JPG、WEBP 或 GIF 圖片') as any, false);
        }
        cb(null, true);
      },
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  uploadStamp(
    @Param('id') id: number,
    @UploadedFile() file: Express.Multer.File,
    @Request() req: any,
  ) {
    if (!file) throw new BadRequestException('請上載公司印圖片');
    const stampUrl = `/uploads/companies/${Number(id)}/${file.filename}`;
    return this.service.uploadStamp(
      Number(id),
      stampUrl,
      req.user?.id || req.user?.userId || 0,
      req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ||
        req.ip ||
        undefined,
    );
  }

  @Post(':id/logo')
  @UseInterceptors(
    FileInterceptor('logo', {
      storage: diskStorage({
        destination: (req, _file, cb) => {
          const companyId = String(req.params.id);
          const uploadDir = join(process.cwd(), 'uploads', 'companies', companyId);
          mkdirSync(uploadDir, { recursive: true });
          cb(null, uploadDir);
        },
        filename: (_req, file, cb) => {
          const originalExt = extname(file.originalname || '').toLowerCase();
          const mimeExt = file.mimetype === 'image/png'
            ? '.png'
            : file.mimetype === 'image/webp'
              ? '.webp'
              : file.mimetype === 'image/gif'
                ? '.gif'
                : '.jpg';
          cb(null, `logo${originalExt || mimeExt}`);
        },
      }),
      fileFilter: (_req, file, cb) => {
        if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.mimetype)) {
          return cb(new BadRequestException('只支援 PNG、JPG、WEBP 或 GIF 圖片') as any, false);
        }
        cb(null, true);
      },
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  uploadLogo(
    @Param('id') id: number,
    @UploadedFile() file: Express.Multer.File,
    @Request() req: any,
  ) {
    if (!file) throw new BadRequestException('請上載公司標誌圖片');
    const logoUrl = `/uploads/companies/${Number(id)}/${file.filename}`;
    return this.service.uploadLogo(
      Number(id),
      logoUrl,
      req.user?.id || req.user?.userId || 0,
      req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ||
        req.ip ||
        undefined,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: number) {
    return this.service.findOne(+id);
  }

  @Post()
  create(@Body() dto: CreateCompanyDto, @Request() req: any) {
    return this.service.create(dto, req.user?.id || req.user?.userId || 0, req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.ip || undefined);
  }

  @Put(':id')
  update(@Param('id') id: number, @Body() dto: UpdateCompanyDto, @Request() req: any) {
    return this.service.update(+id, dto, req.user?.id || req.user?.userId || 0, req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.ip || undefined);
  }
}
