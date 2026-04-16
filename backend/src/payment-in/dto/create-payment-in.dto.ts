import { IsOptional, IsString, IsNumber, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePaymentInDto {
  @IsString() date: string;
  @Type(() => Number) @IsNumber() amount: number;
  @IsString() source_type: string;
  @IsOptional() @Type(() => Number) @IsNumber() source_ref_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() project_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() contract_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() bank_account_id?: number;
  @IsOptional() @IsString() reference_no?: string;
  @IsOptional() @IsString() remarks?: string;
  @IsOptional() @IsString() payment_in_status?: string;
}

export class UpdatePaymentInDto {
  @IsOptional() @IsString() date?: string;
  @IsOptional() @Type(() => Number) @IsNumber() amount?: number;
  @IsOptional() @IsString() source_type?: string;
  @IsOptional() @Type(() => Number) @IsNumber() source_ref_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() project_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() contract_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() bank_account_id?: number;
  @IsOptional() @IsString() reference_no?: string;
  @IsOptional() @IsString() remarks?: string;
  @IsOptional() @IsString() payment_in_status?: string;
}

export class UpdatePaymentInStatusDto {
  @IsString()
  @IsIn(['paid', 'unpaid'])
  payment_in_status: string;
}
