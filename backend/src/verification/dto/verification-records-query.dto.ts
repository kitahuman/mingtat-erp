import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayNotEmpty, ArrayUnique, IsArray, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export const VERIFICATION_RECORD_SORT_FIELDS = [
  'date',
  'vehicle_no',
  'driver_name',
  'contract_no',
  'slip_no',
  'weight',
] as const;

export const VERIFICATION_RECORD_SORT_DIRECTIONS = ['asc', 'desc'] as const;

export const VERIFICATION_RECORD_FILTER_COLUMNS = [
  'source',
  'vehicle_no',
  'driver_name',
  'location_from',
  'location_to',
  'contract_no',
  'match_status',
] as const;

export const VERIFICATION_MATCH_STATUS_FILTERS = ['matched', 'unmatched'] as const;

export type VerificationRecordSortField = (typeof VERIFICATION_RECORD_SORT_FIELDS)[number];
export type VerificationRecordSortDirection = (typeof VERIFICATION_RECORD_SORT_DIRECTIONS)[number];
export type VerificationRecordFilterColumn = (typeof VERIFICATION_RECORD_FILTER_COLUMNS)[number];
export type VerificationMatchStatusFilter = (typeof VERIFICATION_MATCH_STATUS_FILTERS)[number];

export class VerificationRecordsQueryDto {
  @ApiPropertyOptional({ description: '頁碼', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: '每頁筆數', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional({ description: '來源類型 / Tab 篩選' })
  @IsOptional()
  @IsString()
  source_type?: string;

  @ApiPropertyOptional({ description: '開始日期，格式 YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  date_from?: string;

  @ApiPropertyOptional({ description: '結束日期，格式 YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  date_to?: string;

  @ApiPropertyOptional({ description: '關鍵字搜尋' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: '排序欄位', enum: VERIFICATION_RECORD_SORT_FIELDS })
  @IsOptional()
  @IsIn(VERIFICATION_RECORD_SORT_FIELDS)
  sort_field?: VerificationRecordSortField;

  @ApiPropertyOptional({ description: '排序方向', enum: VERIFICATION_RECORD_SORT_DIRECTIONS })
  @IsOptional()
  @IsIn(VERIFICATION_RECORD_SORT_DIRECTIONS)
  sort_direction?: VerificationRecordSortDirection;

  @ApiPropertyOptional({ description: '配對狀態篩選', enum: VERIFICATION_MATCH_STATUS_FILTERS })
  @IsOptional()
  @IsIn(VERIFICATION_MATCH_STATUS_FILTERS)
  match_status?: VerificationMatchStatusFilter;

  @ApiPropertyOptional({ description: '來源欄位篩選，多選以逗號分隔；值為 source_code' })
  @IsOptional()
  @IsString()
  filter_source?: string;

  @ApiPropertyOptional({ description: '車牌欄位篩選，多選以逗號分隔' })
  @IsOptional()
  @IsString()
  filter_vehicle_no?: string;

  @ApiPropertyOptional({ description: '司機欄位篩選，多選以逗號分隔' })
  @IsOptional()
  @IsString()
  filter_driver_name?: string;

  @ApiPropertyOptional({ description: '出發地欄位篩選，多選以逗號分隔' })
  @IsOptional()
  @IsString()
  filter_location_from?: string;

  @ApiPropertyOptional({ description: '目的地欄位篩選，多選以逗號分隔' })
  @IsOptional()
  @IsString()
  filter_location_to?: string;

  @ApiPropertyOptional({ description: '戶口號碼欄位篩選，多選以逗號分隔' })
  @IsOptional()
  @IsString()
  filter_contract_no?: string;

  @ApiPropertyOptional({ description: '配對狀態欄位篩選，多選以逗號分隔；值為 matched 或 unmatched' })
  @IsOptional()
  @IsString()
  filter_match_status?: string;
}

export class VerificationRecordFilterOptionsQueryDto extends VerificationRecordsQueryDto {}

export class VerificationRecordBatchDeleteDto {
  @ApiPropertyOptional({ description: '要刪除的已匯入資料 ID 陣列', type: [Number] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  ids: number[];
}

export interface VerificationRecordFilterOptionDto {
  value: string;
  label: string;
}

export interface VerificationRecordFilterOptionsResponseDto {
  options: VerificationRecordFilterOptionDto[];
}
