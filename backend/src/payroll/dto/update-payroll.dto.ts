import { IsOptional, IsString, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdatePayrollDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() payment_date?: string;
  @IsOptional() @IsString() cheque_number?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() mpf_plan?: string;
  @IsOptional() @Type(() => Number) @IsNumber() mpf_deduction?: number;
  @IsOptional() @Type(() => Number) @IsNumber() mpf_employer?: number;
  @IsOptional() @Type(() => Number) @IsNumber() mpf_relevant_income?: number;
  @IsOptional() @Type(() => Number) @IsNumber() base_rate?: number;
  @IsOptional() @Type(() => Number) @IsNumber() work_days?: number;
  @IsOptional() @Type(() => Number) @IsNumber() base_amount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() allowance_total?: number;
  @IsOptional() @Type(() => Number) @IsNumber() ot_total?: number;
  @IsOptional() @Type(() => Number) @IsNumber() commission_total?: number;
  @IsOptional() @Type(() => Number) @IsNumber() adjustment_total?: number;
  @IsOptional() @Type(() => Number) @IsNumber() net_amount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() company_profile_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() company_id?: number;
}

export class UpdatePayrollWorkLogDto {
  @IsOptional() @IsString() service_type?: string;
  @IsOptional() @IsString() day_night?: string;
  @IsOptional() @IsString() machine_type?: string;
  @IsOptional() @IsString() tonnage?: string;
  @IsOptional() @Type(() => Number) @IsNumber() quantity?: number;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @Type(() => Number) @IsNumber() ot_quantity?: number;
  @IsOptional() @IsString() ot_unit?: string;
  @IsOptional() @Type(() => Number) @IsNumber() rate?: number;
  @IsOptional() @Type(() => Number) @IsNumber() ot_rate?: number;
  @IsOptional() @Type(() => Number) @IsNumber() amount?: number;
  @IsOptional() @IsString() remarks?: string;
  @IsOptional() @IsString() start_location?: string;
  @IsOptional() @IsString() end_location?: string;
  @IsOptional() @IsString() equipment_number?: string;
}
