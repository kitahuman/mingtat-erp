import { IsOptional, IsString, IsNumber, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePartnerDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() name_en?: string;
  @IsOptional() @IsString() short_name?: string;
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() english_code?: string;
  // partner_type is required by DB schema; service will default to 'client' if not provided
  @IsOptional() @IsString() partner_type?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() registration_no?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() mobile?: string;
  @IsOptional() @IsString() fax?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() website?: string;
  @IsOptional() @IsString() contact_person?: string;
  @IsOptional() @IsString() contact_phone?: string;
  @IsOptional() @IsString() contact_email?: string;
  @IsOptional() @IsString() payment_terms?: string;
  @IsOptional() @IsString() bank_name?: string;
  @IsOptional() @IsString() bank_account?: string;
  @IsOptional() @IsString() bank_code?: string;
  @IsOptional() @IsString() invoice_title?: string;
  @IsOptional() @IsString() invoice_description?: string;
  @IsOptional() @IsString() quotation_remarks?: string;
  @IsOptional() @IsString() invoice_remarks?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsBoolean() is_active?: boolean;
  @IsOptional() @IsBoolean() is_subsidiary?: boolean;
  @IsOptional() subsidiaries?: string | string[];
  @IsOptional() @Type(() => Number) @IsNumber() company_id?: number;
}

export class UpdatePartnerDto extends CreatePartnerDto {}
