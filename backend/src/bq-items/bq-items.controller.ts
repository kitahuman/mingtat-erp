import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { extname } from 'path';
import { BqItemsService } from './bq-items.service';
import { BqImportService } from './bq-import.service';
import { CreateBqItemDto, UpdateBqItemDto } from './dto/create-bq-item.dto';
import { BqImportConfirmDto } from './dto/bq-import.dto';

@Controller('contracts/:contractId/bq-items')
@UseGuards(AuthGuard('jwt'))
export class BqItemsController {
  constructor(
    private readonly service: BqItemsService,
    private readonly importService: BqImportService,
  ) {}

  @Get()
  findAll(
    @Param('contractId') contractId: string,
    @Query('sectionId') sectionId?: string,
  ) {
    return this.service.findAll(
      Number(contractId),
      sectionId !== undefined ? Number(sectionId) : undefined,
    );
  }

  @Post()
  create(@Param('contractId') contractId: string, @Body() dto: CreateBqItemDto) {
    return this.service.create(Number(contractId), dto);
  }

  @Put('reorder')
  reorder(@Param('contractId') contractId: string, @Body() body: { orderedIds: number[] }) {
    return this.service.reorder(Number(contractId), body.orderedIds);
  }

  @Post('batch')
  batchCreate(@Param('contractId') contractId: string, @Body() body: { items: any[] }) {
    return this.service.batchCreate(Number(contractId), body.items);
  }

  /** 上傳 BQ 文件（PDF / Excel），用 AI 解析為結構化項目供前端預覽 */
  @Post('import-parse')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 30 * 1024 * 1024 }, // 30MB
      fileFilter: (_req, file, cb) => {
        const ext = extname(file.originalname || '').toLowerCase();
        const okMime = /^(application\/pdf|application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|application\/vnd\.ms-excel|application\/octet-stream)$/i.test(
          file.mimetype,
        );
        const okExt = ['.pdf', '.xlsx', '.xls'].includes(ext);
        if (!okMime && !okExt) {
          return cb(new BadRequestException('只支援 PDF (.pdf) 或 Excel (.xlsx, .xls) 文件') as any, false);
        }
        cb(null, true);
      },
    }),
  )
  importParse(
    @Param('contractId') contractId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('請上傳文件');
    return this.importService.parseFile(file);
  }

  /** 確認匯入：批量建立 BQ 分部與項目 */
  @Post('import-confirm')
  importConfirm(
    @Param('contractId') contractId: string,
    @Body() dto: BqImportConfirmDto,
  ) {
    return this.importService.confirmImport(Number(contractId), dto.items as any[]);
  }

  @Put(':id')
  update(
    @Param('contractId') contractId: string,
    @Param('id') id: string,
    @Body() dto: UpdateBqItemDto,
  ) {
    return this.service.update(Number(contractId), Number(id), dto);
  }

  @Delete(':id')
  remove(@Param('contractId') contractId: string, @Param('id') id: string) {
    return this.service.remove(Number(contractId), Number(id));
  }
}
