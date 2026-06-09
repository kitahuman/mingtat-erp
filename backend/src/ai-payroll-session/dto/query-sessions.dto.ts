import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

const SESSION_STATUSES = [
  'pending',
  'collecting',
  'recognizing',
  'reconciling',
  'calculating',
  'completed',
  'needs_review',
  'confirmed',
  'failed',
  'cancelled',
] as const;

export class QuerySessionsDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  @ApiPropertyOptional({ enum: SESSION_STATUSES })
  @IsOptional()
  @IsString()
  @IsIn(SESSION_STATUSES)
  status?: string;

  @ApiPropertyOptional({ example: '2026-06' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/)
  period?: string;
}
