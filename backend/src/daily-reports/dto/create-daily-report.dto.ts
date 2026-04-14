import { IsOptional, IsString, IsNumber, IsArray } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateDailyReportDto {
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

  // Short-form field names (used by frontend)
  @IsOptional() @IsString() report_date?: string;
  @IsOptional() @IsString() shift_type?: string;
  @IsOptional() @IsString() work_summary?: string;
  @IsOptional() @IsString() memo?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() project_id?: any;
  @IsOptional() client_id?: any;
  @IsOptional() @IsString() client_name?: string;
  @IsOptional() @IsString() client_contract_no?: string;
  @IsOptional() @IsString() project_name?: string;
  @IsOptional() @IsString() project_location?: string;
  @IsOptional() @IsString() completed_work?: string;
  @IsOptional() @IsString() signature?: string;
  @IsOptional() quotation_id?: any;

  @IsOptional() @IsArray() items?: any[];
  @IsOptional() @IsArray() attachments?: any[];
}

export class UpdateDailyReportDto extends CreateDailyReportDto {}
