import { IsOptional, IsString, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateFleetRateCardDto {
  @IsOptional() @Type(() => Number) @IsNumber() client_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() contract_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() company_id?: number;
  @IsOptional() @IsString() client_contract_no?: string;
  @IsOptional() @IsString() service_type?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() machine_type?: string;
  @IsOptional() @IsString() tonnage?: string;
  @IsOptional() @IsString() day_night?: string;
  @IsOptional() @IsString() origin?: string;
  @IsOptional() @IsString() destination?: string;
  @IsOptional() @Type(() => Number) @IsNumber() rate?: number;
  @IsOptional() @Type(() => Number) @IsNumber() day_rate?: number;
  @IsOptional() @Type(() => Number) @IsNumber() night_rate?: number;
  @IsOptional() @Type(() => Number) @IsNumber() mid_shift_rate?: number;
  @IsOptional() @Type(() => Number) @IsNumber() ot_rate?: number;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() effective_date?: string;
  @IsOptional() @IsString() effective_from?: string;
  @IsOptional() @IsString() effective_to?: string;
  @IsOptional() @IsString() remarks?: string;
  @IsOptional() ot_rates?: any;
  @IsOptional() linked_allowances?: any;
}

export class UpdateFleetRateCardDto extends CreateFleetRateCardDto {}
