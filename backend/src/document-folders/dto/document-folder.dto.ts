import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min, ValidateIf } from 'class-validator';

export class CreateDocumentFolderDto {
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  parent_id?: number;
}

export class UpdateDocumentFolderDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ValidateIf((_, value: number | null | undefined) => value !== undefined && value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  parent_id?: number | null;
}
