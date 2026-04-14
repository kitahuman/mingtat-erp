import { IsOptional, IsString, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateRateCardDto {
  @IsOptional() @Type(() => Number) @IsNumber() project_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() client_id?: number;
  @IsOptional() @IsString() machine_type?: string;
  @IsOptional() @IsString() tonnage?: string;
  @IsOptional() @Type(() => Number) @IsNumber() day_rate?: number;
  @IsOptional() @Type(() => Number) @IsNumber() night_rate?: number;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() effective_from?: string;
  @IsOptional() @IsString() effective_to?: string;
  @IsOptional() @IsString() remarks?: string;
  @IsOptional() ot_rates?: any;
}

export class UpdateRateCardDto extends CreateRateCardDto {}
