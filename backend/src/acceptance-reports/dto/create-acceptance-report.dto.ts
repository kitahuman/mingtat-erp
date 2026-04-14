import { IsOptional, IsString, IsNumber, IsArray } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateAcceptanceReportDto {
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
  @IsOptional() @IsArray() acceptance_items?: any[];
  @IsOptional() @IsArray() attachments?: any[];
}

export class UpdateAcceptanceReportDto extends CreateAcceptanceReportDto {}
