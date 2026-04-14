import { IsOptional, IsString, IsNumber, IsArray } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateQuotationDto {
  @IsOptional() @IsString() quotation_no?: string;
  @IsOptional() @Type(() => Number) @IsNumber() company_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() client_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() project_id?: number;
  @IsOptional() @IsString() quotation_type?: string;
  @IsOptional() @IsString() date?: string;
  @IsOptional() @IsString() valid_until?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsString() payment_terms?: string;
  @IsOptional() @IsString() remarks?: string;
  @IsOptional() @Type(() => Number) @IsNumber() subtotal?: number;
  @IsOptional() @Type(() => Number) @IsNumber() total_amount?: number;
  @IsOptional() @IsString() client_contract_no?: string;
  @IsOptional() @IsArray() items?: any[];
}

export class UpdateQuotationDto extends CreateQuotationDto {}
