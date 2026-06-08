import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class UploadPayrollDocumentDto {
  @ApiPropertyOptional({ enum: ['auto', 'attendance_sheet', 'daily_report', 'mixed'], example: 'auto' })
  @IsOptional()
  @IsString()
  @IsIn(['auto', 'attendance_sheet', 'daily_report', 'mixed'])
  formTypeHint?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  splitPdf?: boolean;

  @ApiPropertyOptional({ example: '手機拍攝版本' })
  @IsOptional()
  @IsString()
  notes?: string;
}
