import { IsOptional, IsString, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePaymentOutDto {
  @IsString() date: string;
  @Type(() => Number) @IsNumber() amount: number;
  @IsOptional() @Type(() => Number) @IsNumber() expense_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() payroll_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() company_id?: number;
  @IsOptional() @IsString() payment_out_description?: string;
  @IsOptional() @IsString() payment_out_status?: string;
  @IsOptional() @IsString() bank_account?: string;
  @IsOptional() @IsString() reference_no?: string;
  @IsOptional() @IsString() remarks?: string;
}

export class UpdatePaymentOutDto {
  @IsOptional() @IsString() date?: string;
  @IsOptional() @Type(() => Number) @IsNumber() amount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() expense_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() payroll_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() company_id?: number;
  @IsOptional() @IsString() payment_out_description?: string;
  @IsOptional() @IsString() payment_out_status?: string;
  @IsOptional() @IsString() bank_account?: string;
  @IsOptional() @IsString() reference_no?: string;
  @IsOptional() @IsString() remarks?: string;
}
