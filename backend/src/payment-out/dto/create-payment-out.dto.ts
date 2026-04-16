import { IsOptional, IsString, IsNumber, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePaymentOutDto {
  @IsString() date: string;
  @Type(() => Number) @IsNumber() amount: number;
  @IsOptional() @Type(() => Number) @IsNumber() expense_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() payroll_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() subcon_payroll_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() company_id?: number;
  @IsOptional() @IsString() payment_out_description?: string;
  @IsOptional() @IsString() payment_out_status?: string;
  @IsOptional() @Type(() => Number) @IsNumber() bank_account_id?: number;
  @IsOptional() @IsString() reference_no?: string;
  @IsOptional() @IsString() remarks?: string;
}

export class UpdatePaymentOutDto {
  @IsOptional() @IsString() date?: string;
  @IsOptional() @Type(() => Number) @IsNumber() amount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() expense_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() payroll_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() subcon_payroll_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() company_id?: number;
  @IsOptional() @IsString() payment_out_description?: string;
  @IsOptional() @IsString() payment_out_status?: string;
  @IsOptional() @Type(() => Number) @IsNumber() bank_account_id?: number;
  @IsOptional() @IsString() reference_no?: string;
  @IsOptional() @IsString() remarks?: string;
}

export class UpdatePaymentOutStatusDto {
  @IsString()
  @IsIn(['unpaid', 'paid', 'cancelled'])
  payment_out_status: string;
}
