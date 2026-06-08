import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class ReviewKnowledgeDto {
  @ApiPropertyOptional({ example: '已核對人工修正紀錄，可作為後續提示知識。' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class RejectKnowledgeDto {
  @ApiProperty({ example: '證據不足，暫不採用。' })
  @IsString()
  @MinLength(1)
  reason!: string;
}
