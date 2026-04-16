import { IsOptional, IsString, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class SubconPayrollQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  subcon_id?: number;

  @IsOptional()
  @IsString()
  month?: string; // YYYY-MM format

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number;
}
