import { IsOptional, IsString, IsNumber, IsArray, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class QuotationItemDto {
  @IsOptional() @Type(() => Number) @IsNumber() id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() quotation_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() sort_order?: number;
  @IsOptional() @IsString() item_name?: string;
  @IsOptional() @IsString() item_description?: string;
  @IsOptional() @Type(() => Number) @IsNumber() quantity?: number;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @Type(() => Number) @IsNumber() unit_price?: number;
  @IsOptional() @Type(() => Number) @IsNumber() amount?: number;
  @IsOptional() @IsString() remarks?: string;

  // 詳細配對欄位
  @IsOptional() @IsString() qi_service_type?: string;
  @IsOptional() @IsString() qi_day_night?: string;
  @IsOptional() @IsString() qi_tonnage?: string;
  @IsOptional() @IsString() qi_machine_type?: string;
  @IsOptional() @IsString() qi_origin?: string;
  @IsOptional() @IsString() qi_destination?: string;
  @IsOptional() @Type(() => Number) @IsNumber() qi_ot_rate?: number;
  @IsOptional() @Type(() => Number) @IsNumber() qi_mid_shift_rate?: number;
  @IsOptional() qi_sync_to_rate_card?: boolean;
}

export class CreateQuotationDto {
  @IsOptional() @IsString() quotation_no?: string;
  @IsOptional() @Type(() => Number) @IsNumber() company_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() client_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() project_id?: number;
  @IsOptional() @IsString() quotation_type?: string;
  @IsOptional() @IsString() quotation_date?: string;
  @IsOptional() @IsString() date?: string;
  @IsOptional() @IsString() valid_until?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsString() contract_name?: string;
  @IsOptional() @IsString() project_name?: string;
  @IsOptional() @IsString() validity_period?: string;
  @IsOptional() @IsString() payment_terms?: string;
  @IsOptional() @IsString() exclusions?: string;
  @IsOptional() @IsString() external_remark?: string;
  @IsOptional() @IsString() internal_remark?: string;
  @IsOptional() @IsString() remarks?: string;
  @IsOptional() @Type(() => Number) @IsNumber() subtotal?: number;
  @IsOptional() @Type(() => Number) @IsNumber() total_amount?: number;
  @IsOptional() @IsString() client_contract_no?: string;
  @IsOptional() @IsObject() pdf_font_sizes?: Record<string, unknown>;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => QuotationItemDto) items?: QuotationItemDto[];
}

export class UpdateQuotationDto extends CreateQuotationDto {}

export class CreateQuotationRevisionDto {
  @IsOptional() @IsString() quotation_no?: string;
  @IsOptional() @IsString() quotation_date?: string;
  @IsOptional() @IsString() date?: string;
}

export class AcceptQuotationDto {
  @IsOptional() @IsString() project_name?: string;
  @IsOptional() @IsString() effective_date?: string;
  @IsOptional() @IsString() expiry_date?: string;
}

export class SyncQuotationToRateCardsDto {
  @IsOptional() @IsString() effective_date?: string;
  @IsOptional() @IsString() expiry_date?: string;
  @IsOptional() overwrite?: boolean;
}
