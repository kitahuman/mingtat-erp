import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class InvoiceStatementOtherChargeDto {
  @IsString()
  name: string;

  @IsNumber()
  amount: number;
}

export class CreateInvoiceStatementDto {
  @IsOptional()
  @IsString()
  statement_title?: string;

  @IsOptional()
  @IsNumber()
  company_id?: number;

  @IsOptional()
  @IsNumber()
  client_id?: number;

  @IsOptional()
  @IsString()
  period_start?: string;

  @IsOptional()
  @IsString()
  period_end?: string;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  invoice_ids?: number[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceStatementOtherChargeDto)
  other_charges?: InvoiceStatementOtherChargeDto[];

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class UpdateInvoiceStatementDto {
  @IsOptional()
  @IsString()
  statement_title?: string;

  @IsOptional()
  @IsString()
  statement_status?: string;

  @IsOptional()
  @IsString()
  period_start?: string;

  @IsOptional()
  @IsString()
  period_end?: string;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  invoice_ids?: number[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceStatementOtherChargeDto)
  other_charges?: InvoiceStatementOtherChargeDto[];

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsOptional()
  @IsBoolean()
  statement_show_paid_columns?: boolean;

  @IsOptional()
  @IsBoolean()
  statement_show_bank_info?: boolean;

  @IsOptional()
  @IsBoolean()
  statement_show_signature?: boolean;
}

export class MatchInvoiceStatementInvoicesDto {
  @IsNumber()
  company_id: number;

  @IsNumber()
  client_id: number;

  @IsString()
  period_start: string;

  @IsString()
  period_end: string;
}

export class ReorderStatementItemDto {
  @IsNumber()
  id: number;

  @IsNumber()
  sort_order: number;
}

export class ReorderStatementItemsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderStatementItemDto)
  items: ReorderStatementItemDto[];
}

export class CreateStatementItemDto {
  @IsOptional()
  @IsNumber()
  invoice_id?: number;

  @IsOptional()
  @IsString()
  item_type?: string;

  @IsOptional()
  @IsString()
  item_invoice_no?: string;

  @IsOptional()
  @IsString()
  item_date?: string;

  @IsOptional()
  @IsString()
  item_title?: string;

  @IsOptional()
  @IsString()
  item_status?: string;

  @IsOptional()
  @IsNumber()
  item_amount?: number;

  @IsOptional()
  @IsNumber()
  item_paid_amount?: number;

  @IsOptional()
  @IsNumber()
  item_outstanding?: number;

  @IsOptional()
  @IsString()
  item_remarks?: string;

  @IsOptional()
  @IsNumber()
  sort_order?: number;
}

export class UpdateStatementItemDto {
  @IsOptional()
  @IsString()
  item_invoice_no?: string;

  @IsOptional()
  @IsString()
  item_date?: string;

  @IsOptional()
  @IsString()
  item_title?: string;

  @IsOptional()
  @IsString()
  item_status?: string;

  @IsOptional()
  @IsNumber()
  item_amount?: number;

  @IsOptional()
  @IsNumber()
  item_paid_amount?: number;

  @IsOptional()
  @IsNumber()
  item_outstanding?: number;

  @IsOptional()
  @IsString()
  item_remarks?: string;

  @IsOptional()
  @IsString()
  item_type?: string;
}
