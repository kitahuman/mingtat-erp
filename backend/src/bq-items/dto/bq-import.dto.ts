import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class BqImportItemDto {
  @IsString() item_no!: string;
  @IsString() description!: string;
  @Type(() => Number) @IsNumber() quantity!: number;
  @IsOptional() @IsString() unit?: string;
  @Type(() => Number) @IsNumber() rate!: number;
  @Type(() => Number) @IsNumber() amount!: number;
  @IsOptional() @IsString() section?: string;
}

export class BqImportConfirmDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BqImportItemDto)
  items!: BqImportItemDto[];
}
