import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

export class UpdateAiPayrollBatchDto {
  [key: string]: unknown;

  @ApiPropertyOptional({ example: '2026-05', description: '計糧月份，格式 YYYY-MM' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'payroll_month must be in YYYY-MM format' })
  payroll_month?: string;

  @ApiPropertyOptional({ example: '2026-05', description: '前端 camelCase alias' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'payrollMonth must be in YYYY-MM format' })
  payrollMonth?: string;

  @ApiPropertyOptional({ example: '2026-05', description: 'DB 欄位 alias' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'batch_payroll_month must be in YYYY-MM format' })
  batch_payroll_month?: string;

  @ApiPropertyOptional({ enum: ['auto', 'first_half', 'second_half', 'full_month'], example: 'auto' })
  @IsOptional()
  @IsString()
  @IsIn(['auto', 'first_half', 'second_half', 'full_month'])
  payroll_period?: string;

  @ApiPropertyOptional({ enum: ['auto', 'first_half', 'second_half', 'full_month'], example: 'auto' })
  @IsOptional()
  @IsString()
  @IsIn(['auto', 'first_half', 'second_half', 'full_month'])
  payrollPeriod?: string;

  @ApiPropertyOptional({ enum: ['auto', 'first_half', 'second_half', 'full_month'], example: 'auto' })
  @IsOptional()
  @IsString()
  @IsIn(['auto', 'first_half', 'second_half', 'full_month'])
  batch_period?: string;

  @ApiPropertyOptional({ enum: ['auto', 'attendance_sheet', 'daily_report', 'mixed'], example: 'auto' })
  @IsOptional()
  @IsString()
  @IsIn(['auto', 'attendance_sheet', 'daily_report', 'mixed'])
  default_form_type?: string;

  @ApiPropertyOptional({ enum: ['auto', 'attendance_sheet', 'daily_report', 'mixed'], example: 'auto' })
  @IsOptional()
  @IsString()
  @IsIn(['auto', 'attendance_sheet', 'daily_report', 'mixed'])
  defaultFormType?: string;

  @ApiPropertyOptional({ enum: ['auto', 'attendance_sheet', 'daily_report', 'mixed'], example: 'auto' })
  @IsOptional()
  @IsString()
  @IsIn(['auto', 'attendance_sheet', 'daily_report', 'mixed'])
  batch_form_type_default?: string;

  @ApiPropertyOptional({ example: 'draft' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: 'draft' })
  @IsOptional()
  @IsString()
  batch_status?: string;

  @ApiPropertyOptional({ example: '更新備註' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ example: '更新備註' })
  @IsOptional()
  @IsString()
  batch_notes?: string;
}
