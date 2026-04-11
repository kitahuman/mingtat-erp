import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfirmationService } from './confirmation.service';

@Controller('verification/confirmations')
@UseGuards(AuthGuard('jwt'))
export class ConfirmationController {
  constructor(private readonly confirmationService: ConfirmationService) {}

  /**
   * POST /api/verification/confirmations
   * 確認、拒絕或手動配對
   */
  @Post()
  async upsert(
    @Body()
    body: {
      work_log_id: number;
      source_code: string;
      status: 'confirmed' | 'rejected' | 'manual_match';
      matched_record_id?: number;
      matched_record_type?: string;
      notes?: string;
    },
    @Req() req: any,
  ) {
    const userId = req.user?.id || req.user?.userId;
    return this.confirmationService.upsertConfirmation({
      ...body,
      confirmed_by: userId,
    });
  }

  /**
   * GET /api/verification/confirmations/search/records?source_code=...&date=...&search=...
   * 搜尋可配對的記錄（手動配對用）
   * 注意：此路由必須在 :workLogId 之前，否則 "search" 會被當成 workLogId
   */
  @Get('search/records')
  async searchRecords(
    @Query('source_code') sourceCode: string,
    @Query('date') date: string,
    @Query('search') search: string,
  ) {
    return this.confirmationService.searchRecords({
      source_code: sourceCode,
      date,
      search: search || '',
    });
  }

  /**
   * GET /api/verification/confirmations/:workLogId
   * 查詢單筆工作紀錄的所有確認狀態
   */
  @Get(':workLogId')
  async getByWorkLog(@Param('workLogId', ParseIntPipe) workLogId: number) {
    return this.confirmationService.getConfirmations(workLogId);
  }

  /**
   * DELETE /api/verification/confirmations/:workLogId/:sourceCode
   * 重置為未審核
   */
  @Delete(':workLogId/:sourceCode')
  async remove(
    @Param('workLogId', ParseIntPipe) workLogId: number,
    @Param('sourceCode') sourceCode: string,
  ) {
    return this.confirmationService.deleteConfirmation(workLogId, sourceCode);
  }
}
