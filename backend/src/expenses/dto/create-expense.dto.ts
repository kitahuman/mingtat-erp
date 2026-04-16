import { IsOptional, IsString, IsNumber, IsArray, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export const EXPENSE_PAYMENT_METHODS = ['SELF_PAID', 'COMPANY_PAID'] as const;
export type ExpensePaymentMethod = typeof EXPENSE_PAYMENT_METHODS[number];

export class CreateExpenseDto {
  @IsOptional() @Type(() => Number) @IsNumber() amount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() quantity?: number;
  @IsOptional() @Type(() => Number) @IsNumber() unit_price?: number;
  @IsOptional() @IsString() date?: string;
  @IsOptional() @Type(() => Number) @IsNumber() company_id?: number;
  @IsOptional() @IsString() supplier_name?: string;
  @IsOptional() @Type(() => Number) @IsNumber() supplier_partner_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() category_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() employee_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() machinery_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() client_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() contract_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() project_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() quotation_id?: number;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() receipt_no?: string;
  @IsOptional() @IsString() payment_method?: string;
  @IsOptional() @IsString() payment_status?: string;
  @IsOptional() @Type(() => Number) @IsNumber() subtotal?: number;
  @IsOptional() @Type(() => Number) @IsNumber() tax_amount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() total_amount?: number;
  @IsOptional() @IsString() remarks?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() expense_type?: string;
  @IsOptional() @IsString() cheque_number?: string;
  @IsOptional() @IsString() cheque_date?: string;
  /** 付款方式：SELF_PAID（本人代付）| COMPANY_PAID（公司付款） */
  @IsOptional() @IsString() @IsIn(EXPENSE_PAYMENT_METHODS) expense_payment_method?: ExpensePaymentMethod;
  @IsOptional() @IsArray() items?: any[];
  @IsOptional() @IsArray() attachments?: any[];
}

export class UpdateExpenseDto extends CreateExpenseDto {}

export class CreateExpenseItemDto {
  @IsString() description: string;
  @IsOptional() @Type(() => Number) @IsNumber() quantity?: number;
  @IsOptional() @Type(() => Number) @IsNumber() unit_price?: number;
  @IsOptional() @Type(() => Number) @IsNumber() amount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() sort_order?: number;
}
