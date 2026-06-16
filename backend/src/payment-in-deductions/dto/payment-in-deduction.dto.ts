import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsIn,
  IsNotEmpty,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePaymentInDeductionDto {
  @Type(() => Number)
  @IsInt()
  payment_in_deduction_payment_in_id: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  payment_in_deduction_invoice_id?: number;

  @IsString()
  @IsIn(['retention', 'contra_charge', 'other'])
  payment_in_deduction_type: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  payment_in_deduction_amount: number;

  @IsString()
  @IsNotEmpty()
  payment_in_deduction_remarks: string;
}

export class UpdatePaymentInDeductionDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  payment_in_deduction_invoice_id?: number | null;

  @IsOptional()
  @IsString()
  @IsIn(['retention', 'contra_charge', 'other'])
  payment_in_deduction_type?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  payment_in_deduction_amount?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  payment_in_deduction_remarks?: string;
}
