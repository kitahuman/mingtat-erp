import { IsOptional, IsString, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateContractDto {
  @IsOptional() @Type(() => Number) @IsNumber() client_id?: number;
  @IsOptional() @IsString() contract_no?: string;
  @IsOptional() @IsString() contract_name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() sign_date?: string;
  @IsOptional() @IsString() start_date?: string;
  @IsOptional() @IsString() end_date?: string;
  @IsOptional() @Type(() => Number) @IsNumber() original_amount?: number;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @Type(() => Number) @IsNumber() retention_rate?: number;
  @IsOptional() @Type(() => Number) @IsNumber() retention_cap_rate?: number;
}

export class UpdateContractDto extends CreateContractDto {}
