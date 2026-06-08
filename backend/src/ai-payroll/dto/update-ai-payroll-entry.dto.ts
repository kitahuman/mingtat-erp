import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsObject, IsOptional, IsString } from 'class-validator';

export class UpdateAiPayrollEntryDto {
  [key: string]: unknown;

  @ApiPropertyOptional({ example: { worker_name: '陳大文', hours: 8 }, description: '確認後欄位資料' })
  @IsOptional()
  @IsObject()
  confirmed_data?: Record<string, unknown>;

  @ApiPropertyOptional({ example: { worker_name: '陳大文', hours: 8 }, description: '前端 camelCase alias' })
  @IsOptional()
  @IsObject()
  confirmedData?: Record<string, unknown>;

  @ApiPropertyOptional({ example: { worker_name: '陳大文', hours: 8 }, description: '通用 payload alias' })
  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;

  @ApiPropertyOptional({ example: { worker_name: '陳大文', hours: 8 }, description: '通用 payload alias' })
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @ApiPropertyOptional({ example: { start_time: '08:00' }, description: '人工修正欄位' })
  @IsOptional()
  @IsObject()
  corrections?: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'confirmed' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: 'confirmed' })
  @IsOptional()
  @IsString()
  entry_status?: string;

  @ApiPropertyOptional({ example: 123 })
  @IsOptional()
  @IsNumber()
  employee_id?: number;

  @ApiPropertyOptional({ example: 123 })
  @IsOptional()
  @IsNumber()
  employeeId?: number;

  @ApiPropertyOptional({ example: 123 })
  @IsOptional()
  @IsNumber()
  entry_employee_id?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  mark_confirmed?: boolean;
}
