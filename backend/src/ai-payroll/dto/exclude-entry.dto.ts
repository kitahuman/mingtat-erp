import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ExcludeEntryDto {
  @ApiPropertyOptional({ example: '重複拍攝，不計入計糧。' })
  @IsOptional()
  @IsString()
  reason?: string;
}
