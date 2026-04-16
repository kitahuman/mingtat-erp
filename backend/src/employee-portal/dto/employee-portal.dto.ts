import { IsOptional, IsString, IsNumber, IsArray, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class SubmitWorkLogDto {
  @IsOptional() @IsString() service_type?: string;
  @IsOptional() @IsString() work_content?: string;
  @IsOptional() @IsString() scheduled_date?: string;
  @IsOptional() @Type(() => Number) @IsNumber() client_id?: number;
  @IsOptional() @IsString() unverified_client_name?: string;
  @IsOptional() @IsString() client_contract_no?: string;
  @IsOptional() @IsString() machine_type?: string;
  @IsOptional() @IsString() equipment_number?: string;
  @IsOptional() @IsString() tonnage?: string;
  @IsOptional() @IsString() day_night?: string;
  @IsOptional() @IsString() start_location?: string;
  @IsOptional() @IsString() start_time?: string;
  @IsOptional() @IsString() end_location?: string;
  @IsOptional() @IsString() end_time?: string;
  @IsOptional() @Type(() => Number) @IsNumber() quantity?: number;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @Type(() => Number) @IsNumber() ot_quantity?: number;
  @IsOptional() @IsString() ot_unit?: string;
  @IsOptional() @IsBoolean() is_mid_shift?: boolean;
  @IsOptional() @Type(() => Number) @IsNumber() goods_quantity?: number;
  @IsOptional() @IsString() work_log_product_name?: string;
  @IsOptional() @IsString() work_log_product_unit?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) work_log_photo_urls?: string[];
  @IsOptional() @IsString() work_log_signature_url?: string;
  @IsOptional() @IsString() receipt_no?: string;
  @IsOptional() @IsString() work_order_no?: string;
  @IsOptional() @IsString() remarks?: string;
  @IsOptional() @Type(() => Number) @IsNumber() project_id?: number;
  // photo_urls and signature_url are aliases handled in service layer
  @IsOptional() @IsArray() @IsString({ each: true }) photo_urls?: string[];
  @IsOptional() @IsString() signature_url?: string;
  // ot_hours is an alias for ot_quantity handled in service layer
  @IsOptional() @Type(() => Number) @IsNumber() ot_hours?: number;
}

export class SubmitExpenseDto {
  @IsOptional() @IsString() date?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @Type(() => Number) @IsNumber() total_amount?: number;
  @IsOptional() @IsString() receipt_no?: string;
  @IsOptional() @IsString() remarks?: string;
  // Portal expense fields
  @IsOptional() @Type(() => Number) @IsNumber() category_id?: number;
  @IsOptional() @IsString() item?: string;
  @IsOptional() @IsString() supplier_name?: string;
  @IsOptional() @IsString() payment_method?: string;
  @IsOptional() @IsString() payment_ref?: string;
  /** 付款方式：SELF_PAID（本人代付）| COMPANY_PAID（公司付款） */
  @IsOptional() @IsString() expense_payment_method?: string;
  @IsOptional() @IsArray() items?: any[];
  @IsOptional() @IsArray() attachments?: any[];
}

export class PortalDailyReportDto {
  // Long-form field names (original DTO definition)
  @IsOptional() @IsString() daily_report_date?: string;
  @IsOptional() @Type(() => Number) @IsNumber() daily_report_client_id?: number;
  @IsOptional() @IsString() daily_report_client_name?: string;
  @IsOptional() @Type(() => Number) @IsNumber() daily_report_project_id?: number;
  @IsOptional() @IsString() daily_report_project_name?: string;
  @IsOptional() @IsString() daily_report_project_location?: string;
  @IsOptional() @IsString() daily_report_contract_ref?: string;
  @IsOptional() @IsString() daily_report_site_address?: string;
  @IsOptional() @IsString() daily_report_weather?: string;
  @IsOptional() @IsString() daily_report_supplementary_notes?: string;
  @IsOptional() @IsString() daily_report_status?: string;
  @IsOptional() @IsString() daily_report_client_contract_no?: string;

  // Short-form field names (used by employee-portal frontend)
  @IsOptional() @IsString() report_date?: string;
  @IsOptional() @IsString() shift_type?: string;
  @IsOptional() @IsString() work_summary?: string;
  @IsOptional() @IsString() memo?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() project_id?: string;
  @IsOptional() @IsString() client_id?: string;
  @IsOptional() @IsString() client_name?: string;
  @IsOptional() @IsString() client_contract_no?: string;
  @IsOptional() @IsString() project_name?: string;
  @IsOptional() @IsString() project_location?: string;
  @IsOptional() @IsString() completed_work?: string;
  @IsOptional() @IsString() signature?: string;
  @IsOptional() @Type(() => Number) @IsNumber() quotation_id?: number;

  @IsOptional() @IsArray() items?: any[];
  @IsOptional() @IsArray() attachments?: any[];
}

export class PortalAcceptanceReportDto {
  // Long-form field names (original DTO definition)
  @IsOptional() @IsString() acceptance_report_date?: string;
  @IsOptional() @IsString() acceptance_report_acceptance_date?: string;
  @IsOptional() @Type(() => Number) @IsNumber() acceptance_report_client_id?: number;
  @IsOptional() @IsString() acceptance_report_client_name?: string;
  @IsOptional() @Type(() => Number) @IsNumber() acceptance_report_project_id?: number;
  @IsOptional() @IsString() acceptance_report_project_name?: string;
  @IsOptional() @IsString() acceptance_report_contract_ref?: string;
  @IsOptional() @IsString() acceptance_report_site_address?: string;
  @IsOptional() @IsString() acceptance_report_items?: string;
  @IsOptional() @IsString() acceptance_report_quantity_unit?: string;
  @IsOptional() @Type(() => Number) @IsNumber() acceptance_report_mingtat_inspector_id?: number;
  @IsOptional() @IsString() acceptance_report_mingtat_inspector_name?: string;
  @IsOptional() @IsString() acceptance_report_mingtat_inspector_title?: string;
  @IsOptional() @IsString() acceptance_report_client_contract_no?: string;
  @IsOptional() @IsString() acceptance_report_client_inspector_name?: string;
  @IsOptional() @IsString() acceptance_report_client_inspector_title?: string;
  @IsOptional() @IsString() acceptance_report_client_signature?: string;
  @IsOptional() @IsString() acceptance_report_mingtat_signature?: string;
  @IsOptional() @IsString() acceptance_report_supplementary_notes?: string;
  @IsOptional() @IsString() acceptance_report_status?: string;

  // Short-form field names (used by employee-portal frontend)
  @IsOptional() @IsString() report_date?: string;
  @IsOptional() @IsString() acceptance_date?: string;
  @IsOptional() @IsString() client_id?: string;
  @IsOptional() @IsString() client_name?: string;
  @IsOptional() @IsString() client_contract_no?: string;
  @IsOptional() @IsString() project_id?: string;
  @IsOptional() @IsString() project_name?: string;
  @IsOptional() @IsString() contract_ref?: string;
  @IsOptional() @IsString() site_address?: string;
  @IsOptional() @IsString() acceptance_items?: string;
  @IsOptional() @IsString() quantity_unit?: string;
  @IsOptional() @IsString() mingtat_inspector_id?: string;
  @IsOptional() @IsString() mingtat_inspector_name?: string;
  @IsOptional() @IsString() mingtat_inspector_title?: string;
  @IsOptional() @IsString() client_inspector_name?: string;
  @IsOptional() @IsString() client_inspector_title?: string;
  @IsOptional() @IsString() client_signature?: string;
  @IsOptional() @IsString() mingtat_signature?: string;
  @IsOptional() @IsString() supplementary_notes?: string;
  @IsOptional() @IsString() status?: string;

  @IsOptional() @IsArray() acceptance_items_list?: any[];
  @IsOptional() @IsArray() attachments?: any[];
}
