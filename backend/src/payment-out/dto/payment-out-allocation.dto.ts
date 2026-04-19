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
 * Create allocation: must specify a positive amount and exactly one of
 *  - expense_id
 *  - payroll_id
 *  - subcon_payroll_id
 * (validated in service layer)
 */
export class CreatePaymentOutAllocationDto {
  @Type(() => Number)
  @IsInt()
  payment_out_allocation_payment_out_id!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  payment_out_allocation_expense_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  payment_out_allocation_payroll_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  payment_out_allocation_subcon_payroll_id?: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  payment_out_allocation_amount!: number;

  @IsOptional()
  @IsString()
  payment_out_allocation_remarks?: string;
}

export class UpdatePaymentOutAllocationDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  payment_out_allocation_amount?: number;

  @IsOptional()
  @IsString()
  payment_out_allocation_remarks?: string;
}

/**
 * Search query for documents that can still receive an allocation
 * (used by the frontend allocation picker).
 */
export class AllocationSearchQueryDto {
  /** kind to search: 'expense' | 'payroll' | 'subcon_payroll' */
  @IsString()
  kind!: 'expense' | 'payroll' | 'subcon_payroll';

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @ValidateIf((o: AllocationSearchQueryDto) => o.limit !== undefined)
  @Type(() => Number)
  @IsInt()
  limit?: number;

  /** Only show docs that still have outstanding > 0 (default true) */
  @IsOptional()
  @IsString()
  unpaid_only?: string;
}

export interface AllocationCandidate {
  kind: 'expense' | 'payroll' | 'subcon_payroll';
  id: number;
  doc_no: string;
  description: string;
  total_amount: number;
  allocated_amount: number;
  outstanding_amount: number;
  date: string | null;
}
