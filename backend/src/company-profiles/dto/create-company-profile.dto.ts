import { IsOptional, IsString, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCompanyProfileDto {
  @IsOptional() @Type(() => Number) @IsNumber() company_id?: number;
  @IsOptional() @IsString() profile_name?: string;
  @IsOptional() @IsString() company_name_zh?: string;
  @IsOptional() @IsString() company_name_en?: string;
  @IsOptional() @IsString() address_zh?: string;
  @IsOptional() @IsString() address_en?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() fax?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() logo_url?: string;
  @IsOptional() @IsString() bank_info?: string;
  @IsOptional() @IsString() payment_terms?: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateCompanyProfileDto extends CreateCompanyProfileDto {}
