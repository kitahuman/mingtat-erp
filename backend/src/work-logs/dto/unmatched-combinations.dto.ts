import { IsOptional, IsString, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

// ── GET /work-logs/unmatched-combinations 查詢參數 ──
export class UnmatchedCombinationsQueryDto {
  @IsOptional() @Type(() => Number) @IsNumber() page?: number;
  @IsOptional() @Type(() => Number) @IsNumber() limit?: number;
  @IsOptional() @IsString() sort_by?: string;
  @IsOptional() @IsString() sort_order?: string;

  // 篩選欄位
  @IsOptional() @Type(() => Number) @IsNumber() company_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() client_id?: number;
  @IsOptional() @IsString() client_contract_no?: string;
  @IsOptional() @IsString() service_type?: string;
  @IsOptional() @Type(() => Number) @IsNumber() quotation_id?: number;
  @IsOptional() @IsString() day_night?: string;
  @IsOptional() @IsString() tonnage?: string;
  @IsOptional() @IsString() machine_type?: string;
  @IsOptional() @IsString() start_location?: string;
  @IsOptional() @IsString() end_location?: string;
}

// ── POST /work-logs/add-rate-and-rematch 請求 Body ──
export class AddRateAndRematchDto {
  @IsOptional() @Type(() => Number) @IsNumber() company_id?: number | null;
  @IsOptional() @Type(() => Number) @IsNumber() client_id?: number | null;
  @IsOptional() @IsString() client_contract_no?: string | null;
  @IsOptional() @IsString() service_type?: string | null;
  @IsOptional() @Type(() => Number) @IsNumber() quotation_id?: number | null;
  @IsOptional() @IsString() day_night?: string | null;
  @IsOptional() @IsString() tonnage?: string | null;
  @IsOptional() @IsString() machine_type?: string | null;
  @IsOptional() @IsString() start_location?: string | null;
  @IsOptional() @IsString() end_location?: string | null;

  @Type(() => Number) @IsNumber() rate!: number;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsString() effective_date?: string;
}

// ── 回應型別 ──
export interface UnmatchedCombinationRow {
  company_id: number | null;
  company_name: string | null;
  client_id: number | null;
  client_name: string | null;
  client_contract_no: string | null;
  service_type: string | null;
  quotation_id: number | null;
  quotation_no: string | null;
  day_night: string | null;
  tonnage: string | null;
  machine_type: string | null;
  start_location: string | null;
  end_location: string | null;
  count: number;
}

export interface UnmatchedCombinationsResult {
  data: UnmatchedCombinationRow[];
  total: number;
  totalUnmatched: number;
  page: number;
  limit: number;
  totalPages: number;
}
