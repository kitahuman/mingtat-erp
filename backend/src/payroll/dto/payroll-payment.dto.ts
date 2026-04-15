import { IsNotEmpty, IsOptional, IsString, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePayrollPaymentDto {
  @IsNotEmpty()
  @IsString()
  payroll_payment_date: string;

  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  payroll_payment_amount: number;

  @IsOptional()
  @IsString()
  payroll_payment_reference_no?: string;

  @IsOptional()
  @IsString()
  payroll_payment_bank_account?: string;

  @IsOptional()
  @IsString()
  payroll_payment_remarks?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  payroll_payment_payment_out_id?: number;
}

export class UpdatePayrollPaymentDto {
  @IsOptional()
  @IsString()
  payroll_payment_date?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  payroll_payment_amount?: number;

  @IsOptional()
  @IsString()
  payroll_payment_reference_no?: string;

  @IsOptional()
  @IsString()
  payroll_payment_bank_account?: string;

  @IsOptional()
  @IsString()
  payroll_payment_remarks?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  payroll_payment_payment_out_id?: number;
}

export class AddToRateCardDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  client_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  company_id?: number;

  @IsOptional()
  @IsString()
  client_contract_no?: string;

  @IsOptional()
  @IsString()
  service_type?: string;

  @IsOptional()
  @IsString()
  day_night?: string;

  @IsOptional()
  @IsString()
  tonnage?: string;

  @IsOptional()
  @IsString()
  machine_type?: string;

  @IsOptional()
  @IsString()
  origin?: string;

  @IsOptional()
  @IsString()
  destination?: string;

  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  rate: number;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  ot_rate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  mid_shift_rate?: number;

  @IsOptional()
  @IsString()
  effective_date?: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}
