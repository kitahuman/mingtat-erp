import { IsOptional, IsString, IsNumber, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePartnerDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() short_name?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() registration_no?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() phone?: string;
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
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsBoolean() is_active?: boolean;
  @IsOptional() @Type(() => Number) @IsNumber() company_id?: number;
}

export class UpdatePartnerDto extends CreatePartnerDto {}
