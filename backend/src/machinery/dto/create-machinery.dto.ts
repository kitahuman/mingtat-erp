import { IsOptional, IsString, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateMachineryDto {
  @IsOptional() @Type(() => Number) @IsNumber() from_company_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() to_company_id?: number;
  @IsOptional() @IsString() machine_code?: string;
  @IsOptional() @IsString() machine_type?: string;
  @IsOptional() @IsString() brand?: string;
  @IsOptional() @IsString() model?: string;
  @IsOptional() @Type(() => Number) @IsNumber() tonnage?: number;
  @IsOptional() @IsString() serial_number?: string;
  @IsOptional() @Type(() => Number) @IsNumber() owner_company_id?: number;
  @IsOptional() @IsString() inspection_cert_expiry?: string;
  @IsOptional() @IsString() insurance_expiry?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateMachineryDto extends CreateMachineryDto {}

export class TransferMachineryDto {
  @Type(() => Number) @IsNumber() from_company_id: number;
  @Type(() => Number) @IsNumber() to_company_id: number;
  @IsString() transfer_date: string;
  @IsOptional() @IsString() reason?: string;
}
