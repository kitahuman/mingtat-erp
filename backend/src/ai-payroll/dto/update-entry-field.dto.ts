import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateEntryFieldDto {
  @ApiProperty({ example: '08:00' })
  @IsString()
  correctedValue!: string;

  @ApiPropertyOptional({ example: '原圖確認為 08:00，AI 誤讀為 08:50' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  reason?: string;
}
