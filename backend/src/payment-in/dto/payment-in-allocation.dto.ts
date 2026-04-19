import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  ValidateIf,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Create allocation: must specify a positive amount and an invoice_id.
 * (validated in service layer)
 */
export class CreatePaymentInAllocationDto {
  @Type(() => Number)
  @IsInt()
  payment_in_allocation_payment_in_id!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  payment_in_allocation_invoice_id?: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  payment_in_allocation_amount!: number;

  @IsOptional()
  @IsString()
  payment_in_allocation_remarks?: string;
}

export class UpdatePaymentInAllocationDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  payment_in_allocation_amount?: number;

  @IsOptional()
  @IsString()
  payment_in_allocation_remarks?: string;
}

/**
 * Search query for invoices that can still receive an allocation
 * (used by the frontend allocation picker).
 */
export class PaymentInAllocationSearchQueryDto {
  /** kind to search: currently only 'invoice' is supported */
  @IsOptional()
  @IsString()
  kind?: 'invoice';

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @ValidateIf((o: PaymentInAllocationSearchQueryDto) => o.limit !== undefined)
  @Type(() => Number)
  @IsInt()
  limit?: number;

  /** Only show docs that still have outstanding > 0 (default true) */
  @IsOptional()
  @IsString()
  unpaid_only?: string;
}

export interface PaymentInAllocationCandidate {
  kind: 'invoice';
  id: number;
  doc_no: string;
  description: string;
  total_amount: number;
  allocated_amount: number;
  outstanding_amount: number;
  date: string | null;
}
