import { IsOptional, IsString, IsNumber, IsArray } from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePaymentApplicationDto {
  @IsOptional() @Type(() => Number) @IsNumber() amount?: number;
  @IsOptional() @IsString() bank_account?: string;
  @IsOptional() @Type(() => Number) @IsNumber() client_certified_amount?: number;
  @IsOptional() @IsString() deduction_type?: string;
  @IsOptional() @Type(() => Number) @IsNumber() paid_amount?: number;
  @IsOptional() @IsString() payment_due_date?: string;
  @IsOptional() @IsString() period_from?: string;
  @IsOptional() @IsString() period_to?: string;
  @IsOptional() @IsString() reference_no?: string;
  @IsOptional() @Type(() => Number) @IsNumber() retention_cap_rate?: number;
  @IsOptional() @Type(() => Number) @IsNumber() retention_rate?: number;
  @IsOptional() @Type(() => Number) @IsNumber() pa_no?: number;
  @IsOptional() @Type(() => Number) @IsNumber() project_id?: number;
  @IsOptional() @IsString() date?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() remarks?: string;
}

export class UpdatePaymentApplicationDto extends CreatePaymentApplicationDto {
  @IsOptional() @Type(() => Number) @IsNumber() client_current_due?: number;
  @IsOptional() @Type(() => Number) @IsNumber() other_deductions?: number;
  @IsOptional() @IsString() paid_date?: string;
  @IsOptional() @IsString() description?: string;
}

export class PaymentMaterialDto {
  @IsOptional() @IsString() description?: string;
  @IsOptional() @Type(() => Number) @IsNumber() amount?: number;
  @IsOptional() @IsString() remarks?: string;
}

export class PaymentDeductionDto {
  @IsOptional() @IsString() description?: string;
  @IsOptional() @Type(() => Number) @IsNumber() amount?: number;
  @IsOptional() @IsString() remarks?: string;
}

export class CertifyDto {
  @IsOptional() @Type(() => Number) @IsNumber() client_certified_amount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() client_current_due?: number;
}

export class RecordPaymentDto {
  @IsOptional() @Type(() => Number) @IsNumber() paid_amount?: number;
  @IsOptional() @IsString() paid_date?: string;
}
