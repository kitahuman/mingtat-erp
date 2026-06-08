import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ConfirmPageDto {
  @ApiPropertyOptional({ example: '已按原圖逐項覆核整頁資料。' })
  @IsOptional()
  @IsString()
  reason?: string;
}
