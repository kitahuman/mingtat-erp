import {
  IsArray,
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
