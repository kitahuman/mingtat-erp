import { IsOptional, IsString, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePaymentOutDto {
  @IsString() date: string;
  @Type(() => Number) @IsNumber() amount: number;
  @IsOptional() @Type(() => Number) @IsNumber() expense_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() project_id?: number;
  @IsOptional() @IsString() bank_account?: string;
  @IsOptional() @IsString() reference_no?: string;
  @IsOptional() @IsString() remarks?: string;
}

export class UpdatePaymentOutDto {
  @IsOptional() @IsString() date?: string;
  @IsOptional() @Type(() => Number) @IsNumber() amount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() expense_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() project_id?: number;
  @IsOptional() @IsString() bank_account?: string;
  @IsOptional() @IsString() reference_no?: string;
  @IsOptional() @IsString() remarks?: string;
}
