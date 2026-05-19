import { IsBoolean, IsIn, IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePaymentTermTemplateDto {
  @IsString()
  name: string;

  @IsString()
  content: string;

  @IsOptional()
  @IsIn(['global', 'company', 'client'])
  source_type?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  company_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  client_id?: number;

  @IsOptional()
  @IsBoolean()
  is_default?: boolean;
}

export class UpdatePaymentTermTemplateDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsIn(['global', 'company', 'client'])
  source_type?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  company_id?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  client_id?: number | null;

  @IsOptional()
  @IsBoolean()
  is_default?: boolean;
}
