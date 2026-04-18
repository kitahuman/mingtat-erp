import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  NotFoundException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ErrorLogsService } from './error-logs.service';
import { ErrorLogQueryDto, ErrorLogListResponseDto, ErrorLogResponseDto } from './error-logs.dto';

@ApiTags('error-logs')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard('jwt'))
@Controller('error-logs')
export class ErrorLogsController {
  constructor(private readonly errorLogsService: ErrorLogsService) {}

  @Get()
  @ApiOperation({ summary: '查詢錯誤日誌列表' })
  @ApiResponse({ status: 200, type: ErrorLogListResponseDto })
  async findAll(@Query() query: ErrorLogQueryDto) {
    return this.errorLogsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: '取得單筆錯誤日誌' })
  @ApiResponse({ status: 200, type: ErrorLogResponseDto })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const log = await this.errorLogsService.findOne(id);
    if (!log) {
      throw new NotFoundException(`Error log #${id} not found`);
    }
    return log;
  }
}
