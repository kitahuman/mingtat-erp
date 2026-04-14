import { IsOptional, IsString, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateBqItemDto {
  @IsOptional() @Type(() => Number) @IsNumber() contract_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() section_id?: number;
  @IsOptional() @IsString() item_ref?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @Type(() => Number) @IsNumber() quantity?: number;
  @IsOptional() @Type(() => Number) @IsNumber() unit_rate?: number;
  @IsOptional() @Type(() => Number) @IsNumber() amount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() sort_order?: number;
}

export class UpdateBqItemDto extends CreateBqItemDto {}
