import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  NotEquals,
} from 'class-validator';

export class PettyCashTopupDto {
  @Type(() => Number)
  @IsInt()
  employee_id: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  category_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  company_id?: number;

  @IsOptional()
  @IsString()
  payment_method?: string;

  @IsOptional()
  @IsDateString()
  payment_date?: string;

  @IsOptional()
  @IsString()
  payment_ref?: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class PettyCashAdjustDto {
  @Type(() => Number)
  @IsInt()
  employee_id: number;

  @Type(() => Number)
  @IsNumber()
  @NotEquals(0)
  amount: number;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class PettyCashQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  limit?: number;
}
