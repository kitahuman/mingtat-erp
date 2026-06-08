import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString } from 'class-validator';

export class StartExtractionJobDto {
  @ApiPropertyOptional({ enum: ['auto', 'attendance_sheet', 'daily_report', 'mixed'], example: 'auto' })
  @IsOptional()
  @IsString()
  @IsIn(['auto', 'attendance_sheet', 'daily_report', 'mixed'])
  formTypeOverride?: string;

  @ApiPropertyOptional({ type: [Number], example: [1, 2, 3] })
  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  pageIds?: number[];

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  forceReExtract?: boolean;
}
