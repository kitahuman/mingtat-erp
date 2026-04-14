import { IsOptional, IsString, IsNumber, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

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
}

export class UpdateCompanyDto extends CreateCompanyDto {}
