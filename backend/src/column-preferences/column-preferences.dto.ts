import { IsArray, IsBoolean, IsNumber, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ColumnConfigItemDto {
  @IsString()
  key: string;

  @IsBoolean()
  visible: boolean;

  @IsNumber()
  order: number;
}

export class SaveColumnPreferenceDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ColumnConfigItemDto)
  columns_config: ColumnConfigItemDto[];
}
