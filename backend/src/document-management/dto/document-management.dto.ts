import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export const DOCUMENT_MANAGEMENT_MODULES = [
  'company',
  'employee',
  'vehicle',
  'machinery',
  'partner',
  'company-profile',
  'subcon-fleet-driver',
  'quotation',
  'invoice',
  'expense',
  'contract',
  'project',
  'daily-report',
  'acceptance-report',
] as const;

export const DOCUMENT_MANAGEMENT_SOURCES = [
  'attachment',
  'document',
  'expense-attachment',
  'daily-report-attachment',
  'acceptance-report-attachment',
  'company-file',
] as const;

export type DocumentManagementModule = typeof DOCUMENT_MANAGEMENT_MODULES[number];
export type DocumentManagementSource = typeof DOCUMENT_MANAGEMENT_SOURCES[number];

export class ListDocumentManagementQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  file_name?: string;

  @IsOptional()
  @IsIn(DOCUMENT_MANAGEMENT_MODULES)
  module?: DocumentManagementModule;

  @IsOptional()
  @IsIn(DOCUMENT_MANAGEMENT_SOURCES)
  source?: DocumentManagementSource;

  @IsOptional()
  @IsString()
  date_from?: string;

  @IsOptional()
  @IsString()
  date_to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;
}

export class DocumentFileParamsDto {
  @IsIn(DOCUMENT_MANAGEMENT_SOURCES)
  source!: DocumentManagementSource;

  @IsString()
  id!: string;
}
