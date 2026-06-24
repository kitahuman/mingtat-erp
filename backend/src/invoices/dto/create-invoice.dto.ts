import {
  IsOptional,
  IsString,
  IsNumber,
  IsArray,
  IsObject,
  IsBoolean,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class InvoiceOtherChargeDto {
  @IsString() name: string;
  @Type(() => Number) @IsNumber() amount: number;
}

export class InvoiceItemInputDto {
  @IsOptional() @IsString() item_name?: string;
  @IsOptional() @IsString() description?: string;
  @Type(() => Number) @IsNumber() quantity: number;
  @IsOptional() @IsString() unit?: string;
  @Type(() => Number) @IsNumber() unit_price: number;
  @IsOptional() @Type(() => Number) @IsNumber() amount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() sort_order?: number;
}

export class CreateInvoiceDto {
  @IsOptional() @IsString() invoice_no?: string;
  @IsString() date: string;
  @IsOptional() @IsString() due_date?: string;
  @IsOptional() @Type(() => Number) @IsNumber() client_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() project_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() quotation_id?: number;
  @Type(() => Number) @IsNumber() company_id: number;
  @IsOptional() @IsString() invoice_title?: string;
  @IsOptional() @IsString() display_client_name?: string;
  @IsOptional() @IsString() client_contract_no?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @Type(() => Number) @IsNumber() amount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() subtotal?: number;
  @IsOptional() @Type(() => Number) @IsNumber() tax_rate?: number;
  @IsOptional() @Type(() => Number) @IsNumber() tax_amount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() retention_rate?: number;
  @IsOptional() @Type(() => Number) @IsNumber() retention_amount?: number;
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => InvoiceOtherChargeDto)
  other_charges?: InvoiceOtherChargeDto[];
  @IsOptional() @Type(() => Number) @IsNumber() total_amount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() paid_amount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() outstanding?: number;
  @IsOptional() @IsString() payment_terms?: string;
  @IsOptional() @IsString() invoice_custom_payment_terms?: string;
  @IsOptional() @IsString() invoice_language?: string;
  @IsOptional() @IsBoolean() invoice_show_bank?: boolean;
  @IsOptional() @IsBoolean() invoice_show_client_address?: boolean;
  @IsOptional() @IsBoolean() invoice_show_client_phone?: boolean;
  @IsOptional() @IsBoolean() invoice_show_client_contact?: boolean;
  @IsOptional() @IsBoolean() invoice_show_client_signature?: boolean;
  @IsOptional() @IsBoolean() invoice_show_company_signature?: boolean;
  @IsOptional() @IsBoolean() invoice_show_company_stamp?: boolean;
  @IsOptional() @IsObject() pdf_font_sizes?: Record<string, unknown>;
  @IsOptional() @IsString() remarks?: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemInputDto)
  items?: InvoiceItemInputDto[];
}

export class UpdateInvoiceDto {
  @IsOptional() @IsString() invoice_no?: string;
  @IsOptional() @IsString() date?: string;
  @IsOptional() @IsString() due_date?: string;
  @IsOptional() @Type(() => Number) @IsNumber() client_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() project_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() quotation_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() company_id?: number;
  @IsOptional() @IsString() invoice_title?: string;
  @IsOptional() @IsString() display_client_name?: string;
  @IsOptional() @IsString() client_contract_no?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @Type(() => Number) @IsNumber() subtotal?: number;
  @IsOptional() @Type(() => Number) @IsNumber() tax_rate?: number;
  @IsOptional() @Type(() => Number) @IsNumber() tax_amount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() retention_rate?: number;
  @IsOptional() @Type(() => Number) @IsNumber() retention_amount?: number;
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => InvoiceOtherChargeDto)
  other_charges?: InvoiceOtherChargeDto[];
  @IsOptional() @Type(() => Number) @IsNumber() total_amount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() paid_amount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() outstanding?: number;
  @IsOptional() @IsString() payment_terms?: string;
  @IsOptional() @IsString() invoice_custom_payment_terms?: string;
  @IsOptional() @IsString() invoice_language?: string;
  @IsOptional() @IsBoolean() invoice_show_bank?: boolean;
  @IsOptional() @IsBoolean() invoice_show_client_address?: boolean;
  @IsOptional() @IsBoolean() invoice_show_client_phone?: boolean;
  @IsOptional() @IsBoolean() invoice_show_client_contact?: boolean;
  @IsOptional() @IsBoolean() invoice_show_client_signature?: boolean;
  @IsOptional() @IsBoolean() invoice_show_company_signature?: boolean;
  @IsOptional() @IsBoolean() invoice_show_company_stamp?: boolean;
  @IsOptional() @IsObject() pdf_font_sizes?: Record<string, unknown>;
  @IsOptional() @IsString() remarks?: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemInputDto)
  items?: InvoiceItemInputDto[];
}

export class CreateFromQuotationDto {
  @IsOptional() @IsString() date?: string;
  @IsOptional() @IsString() due_date?: string;
  @IsOptional() @Type(() => Number) @IsNumber() tax_rate?: number;
  @IsOptional() @Type(() => Number) @IsNumber() retention_rate?: number;
  @IsOptional() @IsString() payment_terms?: string;
  @IsOptional() @IsString() remarks?: string;
}

export class CreateInvoiceRevisionDto {
  @IsOptional() @IsString() invoice_no?: string;
  @IsOptional() @IsString() date?: string;
  @IsOptional() @IsString() due_date?: string;
}

export class SetActiveInvoiceRevisionDto {
  @IsOptional() @IsBoolean() invoice_is_active?: boolean;
}

export class RecordPaymentDto {
  @IsString() date: string;
  @Type(() => Number) @IsNumber() amount: number;
  @IsOptional() @IsString() bank_account?: string;
  @IsOptional() @IsString() reference_no?: string;
  @IsOptional() @IsString() remarks?: string;
}

export class InvoiceWorkLogsDto {
  @IsArray() work_log_ids: number[];
}

export type InvoiceWorkLogDraftScalar = string | number | boolean | null;
export type InvoiceWorkLogDraftValue =
  | InvoiceWorkLogDraftScalar
  | InvoiceWorkLogDraftScalar[]
  | { [key: string]: InvoiceWorkLogDraftScalar | InvoiceWorkLogDraftScalar[] };
export type InvoiceWorkLogDraftData = Record<string, InvoiceWorkLogDraftValue>;

export class InvoiceWorkLogDraftItemDto {
  @Type(() => Number)
  @IsNumber()
  work_log_id: number;

  @IsObject()
  draft_data: InvoiceWorkLogDraftData;
}

export class SaveInvoicePrepareDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceWorkLogDraftItemDto)
  drafts: InvoiceWorkLogDraftItemDto[];
}

export class InvoicePricingGroupDto {
  @IsOptional() @Type(() => Number) @IsNumber() company_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() client_id?: number;
  @IsOptional() @IsString() client_contract_no?: string;
  @IsOptional() @IsString() service_type?: string;
  @IsOptional() @Type(() => Number) @IsNumber() quotation_id?: number;
  @IsOptional() @IsString() day_night?: string;
  @IsOptional() @IsString() tonnage?: string;
  @IsOptional() @IsString() machine_type?: string;
  @IsOptional() @IsString() origin?: string;
  @IsOptional() @IsString() destination?: string;
  @IsOptional() @IsString() work_date?: string;
  @Type(() => Number) @IsNumber() count: number;
}

export class MatchInvoiceRatesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoicePricingGroupDto)
  groups: InvoicePricingGroupDto[];
}

export class SaveInvoicePricingDraftDto {
  @IsObject()
  pivot_config: Record<string, unknown>;

  @IsObject()
  row_prices: Record<string, unknown>;

  @IsArray()
  draft_items: Record<string, unknown>[];
}

export class UpdateInvoiceItemDto {
  @IsOptional() @IsString() item_name?: string;
  @IsOptional() @IsString() description?: string;
  @Type(() => Number) @IsNumber() quantity: number;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @Type(() => Number) @IsNumber() unit_price?: number;
  @IsOptional() @Type(() => Number) @IsNumber() amount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() sort_order?: number;
}

export class UpdateInvoiceItemsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateInvoiceItemDto)
  items: UpdateInvoiceItemDto[];
}

export class PreviewNumberDto {
  @Type(() => Number) @IsNumber() company_id: number;
  // client_id 可選；date 必填
  @IsOptional() @Type(() => Number) @IsNumber() client_id?: number;
  @IsString() date: string;
}
