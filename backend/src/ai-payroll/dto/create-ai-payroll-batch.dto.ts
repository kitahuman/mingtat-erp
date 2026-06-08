import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString, Matches } from 'class-validator';

export class CreateAiPayrollBatchDto {
  @ApiProperty({ example: '2026-05', description: '計糧月份，格式 YYYY-MM' })
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'payroll_month must be in YYYY-MM format' })
  payroll_month!: string;

  @ApiPropertyOptional({ enum: ['auto', 'first_half', 'second_half', 'full_month'], example: 'auto' })
  @IsOptional()
  @IsString()
  @IsIn(['auto', 'first_half', 'second_half', 'full_month'])
  payroll_period?: string;

  @ApiPropertyOptional({ enum: ['auto', 'attendance_sheet', 'daily_report', 'mixed'], example: 'auto' })
  @IsOptional()
  @IsString()
  @IsIn(['auto', 'attendance_sheet', 'daily_report', 'mixed'])
  default_form_type?: string;

  @ApiPropertyOptional({ example: '2026-06-07' })
  @IsOptional()
  @IsDateString()
  expected_pay_date?: string;

  @ApiPropertyOptional({ example: '地盤部' })
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional({ example: '蓮麻坑' })
  @IsOptional()
  @IsString()
  site_name?: string;

  @ApiPropertyOptional({ example: '5 月功課紙及日報表' })
  @IsOptional()
  @IsString()
  notes?: string;
}
