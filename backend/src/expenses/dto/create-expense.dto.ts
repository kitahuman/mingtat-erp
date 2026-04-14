import { IsOptional, IsString, IsNumber, IsArray } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateExpenseDto {
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
