import { IsOptional, IsString, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProjectDto {
  @IsOptional() @IsString() project_no?: string;
  @IsOptional() @IsString() project_name?: string;
  @IsOptional() @Type(() => Number) @IsNumber() company_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() client_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() contract_id?: number;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() start_date?: string;
  @IsOptional() @IsString() end_date?: string;
  @IsOptional() @IsString() remarks?: string;
  @IsOptional() @IsString() client_contract_no?: string;
}

export class UpdateProjectDto extends CreateProjectDto {}
