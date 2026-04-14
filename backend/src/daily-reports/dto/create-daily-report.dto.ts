import { IsOptional, IsString, IsNumber, IsArray } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateDailyReportDto {
  @IsOptional() @IsString() daily_report_date?: string;
  @IsOptional() @Type(() => Number) @IsNumber() daily_report_client_id?: number;
  @IsOptional() @IsString() daily_report_client_name?: string;
  @IsOptional() @Type(() => Number) @IsNumber() daily_report_project_id?: number;
  @IsOptional() @IsString() daily_report_project_name?: string;
  @IsOptional() @IsString() daily_report_contract_ref?: string;
  @IsOptional() @IsString() daily_report_site_address?: string;
  @IsOptional() @IsString() daily_report_weather?: string;
  @IsOptional() @IsString() daily_report_supplementary_notes?: string;
  @IsOptional() @IsString() daily_report_status?: string;
  @IsOptional() @IsString() daily_report_client_contract_no?: string;
  @IsOptional() @IsArray() items?: any[];
  @IsOptional() @IsArray() attachments?: any[];
}

export class UpdateDailyReportDto extends CreateDailyReportDto {}
