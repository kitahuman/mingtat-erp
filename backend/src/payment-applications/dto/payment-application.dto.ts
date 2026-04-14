import { IsOptional, IsString, IsNumber, IsArray } from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePaymentApplicationDto {
  @IsOptional() @Type(() => Number) @IsNumber() pa_no?: number;
  @IsOptional() @Type(() => Number) @IsNumber() project_id?: number;
  @IsOptional() @IsString() date?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() remarks?: string;
}

export class UpdatePaymentApplicationDto extends CreatePaymentApplicationDto {
  @IsOptional() @Type(() => Number) @IsNumber() client_certified_amount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() client_current_due?: number;
  @IsOptional() @Type(() => Number) @IsNumber() other_deductions?: number;
  @IsOptional() @Type(() => Number) @IsNumber() paid_amount?: number;
  @IsOptional() @IsString() paid_date?: string;
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
