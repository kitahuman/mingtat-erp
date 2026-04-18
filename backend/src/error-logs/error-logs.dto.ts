import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt, IsDateString, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class ErrorLogQueryDto {
  @ApiPropertyOptional({ description: '頁碼', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: '每頁數量', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: 'HTTP 狀態碼篩選' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  statusCode?: number;

  @ApiPropertyOptional({ description: 'API 路徑篩選' })
  @IsOptional()
  @IsString()
  path?: string;

  @ApiPropertyOptional({ description: '開始日期' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: '結束日期' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}

export class ErrorLogResponseDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  error_log_timestamp!: Date;

  @ApiProperty()
  error_log_method!: string;

  @ApiProperty()
  error_log_path!: string;

  @ApiProperty()
  error_log_status_code!: number;

  @ApiProperty()
  error_log_message!: string;

  @ApiPropertyOptional()
  error_log_stack?: string | null;

  @ApiPropertyOptional()
  error_log_user_id?: number | null;

  @ApiPropertyOptional()
  error_log_username?: string | null;

  @ApiPropertyOptional()
  error_log_request_body?: Record<string, unknown> | null;

  @ApiProperty()
  error_log_notified!: boolean;
}

export class ErrorLogListResponseDto {
  @ApiProperty({ type: [ErrorLogResponseDto] })
  data!: ErrorLogResponseDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  totalPages!: number;
}
