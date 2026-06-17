import { IsOptional, IsString, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCompanyProfileDto {
  @IsOptional() @Type(() => Number) @IsNumber() company_id?: number;
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() chinese_name?: string;
  @IsOptional() @IsString() english_name?: string;
  @IsOptional() @IsString() registration_date?: string;
  @IsOptional() @IsString() br_number?: string;
  @IsOptional() @IsString() br_expiry_date?: string;
  @IsOptional() @IsString() cr_number?: string;
  @IsOptional() @IsString() registered_address?: string;
  @IsOptional() @IsString() directors?: string;
  @IsOptional() @IsString() shareholders?: string;
  @IsOptional() @IsString() secretary?: string;
  @IsOptional() @IsString() subcontractor_reg_no?: string;
  @IsOptional() @IsString() subcontractor_reg_date?: string;
  @IsOptional() @IsString() subcontractor_reg_expiry?: string;
  @IsOptional() @IsString() subcontractor_work_types?: string;
  @IsOptional() @IsString() subcontractor_specialties?: string;
  @IsOptional() @IsString() office_phone?: string;
  @IsOptional() @IsString() office_fax?: string;
  @IsOptional() @IsString() office_email?: string;
  @IsOptional() @IsString() office_address?: string;
  @IsOptional() @IsString() status?: string;
}

export class UpdateCompanyProfileDto extends CreateCompanyProfileDto {}
