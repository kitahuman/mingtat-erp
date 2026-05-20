import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export enum LocationOptionSortBy {
  Usage = 'usage',
  Name = 'name',
}

export enum SortDirection {
  Asc = 'asc',
  Desc = 'desc',
}

export enum DuplicateLocationReason {
  ExactNormalizedMatch = 'exact_normalized_match',
  SimilarName = 'similar_name',
}

export class CreateFieldOptionDto {
  @IsString()
  @IsNotEmpty()
  category!: string;

  @IsString()
  @IsNotEmpty()
  label!: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  sort_order?: number;
}

export class UpdateFieldOptionDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  label?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  sort_order?: number;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  is_active?: boolean;
}

export class ReorderFieldOptionsDto {
  @IsString()
  @IsNotEmpty()
  category!: string;

  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  orderedIds!: number[];
}

export class MergeLocationsDto {
  @IsInt()
  @Type(() => Number)
  primaryId!: number;

  @IsArray()
  @IsInt({ each: true })
  @ArrayMinSize(1)
  @Type(() => Number)
  mergeIds!: number[];
}

export class BulkImportFieldOptionsDto {
  @IsString()
  @IsNotEmpty()
  category!: string;

  @IsArray()
  @IsString({ each: true })
  labels!: string[];
}

export class UpdateAliasesDto {
  @IsArray()
  @IsString({ each: true })
  aliases!: string[];
}

export class UpdateGpsDto {
  @IsNumber()
  @Type(() => Number)
  field_option_latitude!: number;

  @IsNumber()
  @Type(() => Number)
  field_option_longitude!: number;
}

export class LocationOptionsQueryDto {
  @IsOptional()
  @IsEnum(LocationOptionSortBy)
  sortBy: LocationOptionSortBy = LocationOptionSortBy.Name;

  @IsOptional()
  @IsEnum(SortDirection)
  sortOrder: SortDirection = SortDirection.Asc;
}

export class FindDuplicateLocationsQueryDto {
  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(1)
  @Type(() => Number)
  minSimilarity: number = 0.82;
}

export class LocationUsageOptionDto {
  id!: number;
  category!: string;
  label!: string;
  sort_order!: number;
  is_active!: boolean;
  aliases!: string[];
  field_option_latitude!: number | null;
  field_option_longitude!: number | null;
  created_at!: Date;
  updated_at!: Date;
  worklog_usage_count!: number;
  start_usage_count!: number;
  end_usage_count!: number;
}

export class DuplicateLocationCandidateDto extends LocationUsageOptionDto {
  normalized_label!: string;
}

export class DuplicateLocationGroupDto {
  groupKey!: string;
  reason!: DuplicateLocationReason;
  similarity!: number;
  locations!: DuplicateLocationCandidateDto[];
}
