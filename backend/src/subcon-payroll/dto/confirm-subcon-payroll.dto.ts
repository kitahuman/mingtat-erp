import { IsNumber, IsString, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ExtraItemDto {
  @IsString()
  name: string;

  @Type(() => Number)
  @IsNumber()
  amount: number;
}

export class ConfirmSubconPayrollDto {
  @Type(() => Number)
  @IsNumber()
  subcon_id: number;

  @IsString()
  date_from: string;

  @IsString()
  date_to: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  company_id?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExtraItemDto)
  extra_items?: ExtraItemDto[];
}
