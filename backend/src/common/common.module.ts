import { Module } from '@nestjs/common';
import { PdfUtilService } from './pdf-util.service';

/**
 * 共用工具模組。提供需要註冊為 NestJS provider 的共用 service（如 PdfUtilService）。
 * 各功能模組可 import CommonModule 後注入這些共用 service。
 */
@Module({
  providers: [PdfUtilService],
  exports: [PdfUtilService],
})
export class CommonModule {}
