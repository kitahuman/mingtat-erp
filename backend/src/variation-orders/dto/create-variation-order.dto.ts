import { IsOptional, IsString, IsNumber, IsArray } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateVariationOrderDto {
  @IsOptional() @Type(() => Number) @IsNumber() approved_amount?: number;
  @IsOptional() @IsString() approved_date?: string;
  @IsOptional() @IsString() submitted_date?: string;
  @IsOptional() @Type(() => Number) @IsNumber() contract_id?: number;
  @IsOptional() @IsString() vo_no?: string;
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() date?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @Type(() => Number) @IsNumber() total_amount?: number;
  @IsOptional() @IsString() remarks?: string;
  @IsOptional() @IsArray() items?: any[];
}

export class UpdateVariationOrderDto extends CreateVariationOrderDto {}
