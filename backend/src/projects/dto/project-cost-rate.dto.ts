import {
  IsOptional,
  IsString,
  IsNumber,
  IsIn,
  IsArray,
  ValidateNested,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export const COST_RATE_CATEGORIES = [
  'worker',
  'machinery',
  'vehicle',
  'tool',
] as const;

export class CreateProjectCostRateDto {
  @IsString()
  @IsIn(COST_RATE_CATEGORIES as unknown as string[])
  category: string;

  @IsString()
  @MaxLength(100)
  type: string;

  @IsOptional() @Type(() => Number) @IsNumber() tonnage?: number | null;
  @IsOptional() @Type(() => Number) @IsNumber() day_rate?: number;
  @IsOptional() @Type(() => Number) @IsNumber() ot_rate?: number;
  @IsOptional() @IsString() remarks?: string | null;
}

export class UpdateProjectCostRateDto {
  @IsOptional()
  @IsString()
  @IsIn(COST_RATE_CATEGORIES as unknown as string[])
  category?: string;

  @IsOptional() @IsString() @MaxLength(100) type?: string;
  @IsOptional() @Type(() => Number) @IsNumber() tonnage?: number | null;
  @IsOptional() @Type(() => Number) @IsNumber() day_rate?: number;
  @IsOptional() @Type(() => Number) @IsNumber() ot_rate?: number;
  @IsOptional() @IsString() remarks?: string | null;
}

export class BatchUpsertProjectCostRatesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProjectCostRateDto)
  rates: CreateProjectCostRateDto[];
}
