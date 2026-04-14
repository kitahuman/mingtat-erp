import { IsOptional, IsString, IsNumber, IsBoolean, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateWorkLogDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() service_type?: string;
  @IsOptional() @IsString() scheduled_date?: string;
  @IsOptional() @Type(() => Number) @IsNumber() company_profile_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() company_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() client_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() quotation_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() contract_id?: number;
  @IsOptional() @IsString() client_contract_no?: string;
  @IsOptional() @Type(() => Number) @IsNumber() employee_id?: number;
  @IsOptional() @IsString() machine_type?: string;
  @IsOptional() @IsString() equipment_number?: string;
  @IsOptional() @IsString() equipment_source?: string;
  @IsOptional() @IsString() tonnage?: string;
  @IsOptional() @IsString() day_night?: string;
  @IsOptional() @IsString() start_location?: string;
  @IsOptional() @IsString() start_time?: string;
  @IsOptional() @IsString() end_location?: string;
  @IsOptional() @IsString() end_time?: string;
  @IsOptional() @Type(() => Number) @IsNumber() quantity?: number;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @Type(() => Number) @IsNumber() ot_quantity?: number;
  @IsOptional() @IsString() ot_unit?: string;
  @IsOptional() @IsBoolean() is_mid_shift?: boolean;
  @IsOptional() @Type(() => Number) @IsNumber() goods_quantity?: number;
  @IsOptional() @Type(() => Number) @IsNumber() matched_rate_card_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() matched_rate?: number;
  @IsOptional() @IsString() matched_unit?: string;
  @IsOptional() @Type(() => Number) @IsNumber() matched_ot_rate?: number;
  @IsOptional() @IsString() price_match_status?: string;
  @IsOptional() @IsString() price_match_note?: string;
  @IsOptional() @IsString() receipt_no?: string;
  @IsOptional() @IsString() work_order_no?: string;
  @IsOptional() @IsBoolean() is_confirmed?: boolean;
  @IsOptional() @IsBoolean() is_paid?: boolean;
  @IsOptional() @IsString() unverified_client_name?: string;
  @IsOptional() @IsString() source?: string;
  @IsOptional() @IsBoolean() is_location_new?: boolean;
  @IsOptional() ai_parsed_data?: any;
  @IsOptional() @IsString() work_log_product_name?: string;
  @IsOptional() @IsString() work_log_product_unit?: string;
  @IsOptional() work_log_photo_urls?: any;
  @IsOptional() @IsString() work_log_signature_url?: string;
  @IsOptional() @IsString() remarks?: string;
  @IsOptional() @Type(() => Number) @IsNumber() project_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() work_log_fleet_driver_id?: number;
}

export class UpdateWorkLogDto extends CreateWorkLogDto {}
