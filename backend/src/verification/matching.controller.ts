import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MatchingService } from './matching.service';

@Controller('verification')
@UseGuards(AuthGuard('jwt'))
export class MatchingController {
  constructor(private readonly matchingService: MatchingService) {}

  // ── 單筆工作紀錄核對（工作紀錄頁面展開面板） ────────────────
  @Get('match-single/:workLogId')
  async matchSingle(@Param('workLogId', ParseIntPipe) workLogId: number) {
    return this.matchingService.matchSingle(workLogId);
  }

  // ── 六來源交叉比對總覽 ────────────────────────────────────
  @Get('matching')
  async getMatchingOverview(
    @Query('date_from') dateFrom?: string,
    @Query('date_to') dateTo?: string,
    @Query('group_by') groupBy?: string,
    @Query('search') search?: string,
    @Query('review_status') reviewStatus?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    if (!dateFrom || !dateTo) {
      throw new BadRequestException('date_from 和 date_to 為必填');
    }

    return this.matchingService.getMatchingOverview({
      date_from: dateFrom,
      date_to: dateTo,
      group_by: (groupBy as 'vehicle' | 'employee') || 'vehicle',
      search,
      review_status: (reviewStatus as any) || 'all',
      page: page ? +page : 1,
      limit: limit ? +limit : 50,
    });
  }
}
