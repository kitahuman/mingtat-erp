import { IsOptional, IsString, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateBqSectionDto {
  @IsOptional() @IsString() section_code?: string;
  @IsOptional() @Type(() => Number) @IsNumber() contract_id?: number;
  @IsOptional() @IsString() section_name?: string;
  @IsOptional() @Type(() => Number) @IsNumber() sort_order?: number;
}

export class UpdateBqSectionDto extends CreateBqSectionDto {}
