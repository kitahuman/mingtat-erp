import { IsOptional, IsString, IsBoolean, IsObject, IsHexColor } from 'class-validator';

export class CreateCompanyDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() short_name?: string;
  @IsOptional() @IsString() registration_no?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() fax?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() website?: string;
  @IsOptional() @IsString() contact_person?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsBoolean() is_active?: boolean;
  @IsOptional() @IsString() company_logo_url?: string;
  @IsOptional() @IsHexColor() invoice_color_theme?: string;
  @IsOptional() @IsObject() invoice_bank_info?: Record<string, unknown>;
  @IsOptional() @IsString() invoice_default_payment_terms?: string;
}

export class UpdateCompanyDto extends CreateCompanyDto {}
