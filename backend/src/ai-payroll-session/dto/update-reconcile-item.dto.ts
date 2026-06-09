import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsNumber, IsObject, IsOptional, IsString, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { StandardizedSourceRecordData } from '../interfaces/source-record.interface';

const RECONCILE_STATUSES = [
  'pending',
  'matched',
  'conflict',
  'needs_review',
  'confirmed',
  'excluded',
] as const;

export class UpdateReconcileItemDto {
  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  decided_data?: Partial<StandardizedSourceRecordData>;

  @ApiPropertyOptional({ example: 'driver' })
  @IsOptional()
  @IsString()
  work_type?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  has_ot?: boolean;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  ot_hours?: number;

  @ApiPropertyOptional({ enum: RECONCILE_STATUSES })
  @IsOptional()
  @IsString()
  @IsIn(RECONCILE_STATUSES)
  status?: string;
}
