import { IsOptional, IsString, IsNumber, IsArray } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateInvoiceDto {
  @IsOptional() @IsString() invoice_no?: string;
  @IsString() date: string;
  @IsOptional() @IsString() due_date?: string;
  @IsOptional() @Type(() => Number) @IsNumber() client_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() project_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() quotation_id?: number;
  @Type(() => Number) @IsNumber() company_id: number;
  @IsOptional() @IsString() invoice_title?: string;
  @IsOptional() @IsString() client_contract_no?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @Type(() => Number) @IsNumber() subtotal?: number;
  @IsOptional() @Type(() => Number) @IsNumber() tax_rate?: number;
  @IsOptional() @Type(() => Number) @IsNumber() tax_amount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() retention_rate?: number;
  @IsOptional() @Type(() => Number) @IsNumber() retention_amount?: number;
  @IsOptional() other_charges?: any;
  @IsOptional() @Type(() => Number) @IsNumber() total_amount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() paid_amount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() outstanding?: number;
  @IsOptional() @IsString() payment_terms?: string;
  @IsOptional() @IsString() remarks?: string;
  @IsOptional() @IsArray() items?: any[];
}

export class UpdateInvoiceDto {
  @IsOptional() @IsString() invoice_no?: string;
  @IsOptional() @IsString() date?: string;
  @IsOptional() @IsString() due_date?: string;
  @IsOptional() @Type(() => Number) @IsNumber() client_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() project_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() quotation_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() company_id?: number;
  @IsOptional() @IsString() invoice_title?: string;
  @IsOptional() @IsString() client_contract_no?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @Type(() => Number) @IsNumber() subtotal?: number;
  @IsOptional() @Type(() => Number) @IsNumber() tax_rate?: number;
  @IsOptional() @Type(() => Number) @IsNumber() tax_amount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() retention_rate?: number;
  @IsOptional() @Type(() => Number) @IsNumber() retention_amount?: number;
  @IsOptional() other_charges?: any;
  @IsOptional() @Type(() => Number) @IsNumber() total_amount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() paid_amount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() outstanding?: number;
  @IsOptional() @IsString() payment_terms?: string;
  @IsOptional() @IsString() remarks?: string;
  @IsOptional() @IsArray() items?: any[];
}

export class RecordPaymentDto {
  @IsString() date: string;
  @Type(() => Number) @IsNumber() amount: number;
  @IsOptional() @IsString() bank_account?: string;
  @IsOptional() @IsString() reference_no?: string;
  @IsOptional() @IsString() remarks?: string;
}
