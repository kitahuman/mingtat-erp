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

  /**
   * Optional retention deduction taken at allocation time.
   * When > 0, the backend will add this amount to the linked invoice's
   * retention_amount (no separate deduction record is created). The
   * payment_in_allocation_amount passed in is the actual received amount
   * (already net of this retention deduction).
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  retention_deduction_amount?: number;

  /**
   * Optional other deduction amount (e.g., bank fees, taxes, etc.).
   * When > 0, a PaymentInDeduction record with type='Other' is created.
   * Does NOT update invoice.retention_amount.
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  other_deduction_amount?: number;

  /**
   * Remarks for the other deduction.
   */
  @IsOptional()
  @IsString()
  other_deduction_remarks?: string;
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
  retention_amount?: number;
  date: string | null;
}
