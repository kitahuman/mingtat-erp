import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateAiPayrollBatchDto {
  @ApiProperty({ example: 2026 })
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  payrollYear!: number;

  @ApiProperty({ example: 5 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  payrollMonth!: number;

  @ApiPropertyOptional({ enum: ['first_half', 'second_half', 'full_month'], example: 'full_month' })
  @IsOptional()
  @IsString()
  @IsIn(['first_half', 'second_half', 'full_month'])
  payrollPeriodType?: string;

  @ApiPropertyOptional({ example: '2026-05-01' })
  @IsOptional()
  @IsString()
  periodStartDate?: string;

  @ApiPropertyOptional({ example: '2026-05-31' })
  @IsOptional()
  @IsString()
  periodEndDate?: string;

  @ApiPropertyOptional({ enum: ['auto', 'attendance_sheet', 'daily_report', 'mixed'], example: 'mixed' })
  @IsOptional()
  @IsString()
  @IsIn(['auto', 'attendance_sheet', 'daily_report', 'mixed'])
  defaultFormType?: string;

  @ApiPropertyOptional({ example: '5 月功課紙及日報表' })
  @IsOptional()
  @IsString()
  remark?: string;
}
