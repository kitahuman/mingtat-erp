import { IsOptional, IsString, IsNumber, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateNicknameMappingDto {
  @IsString()
  nickname_value: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  nickname_employee_id?: number;

  @IsOptional()
  @IsString()
  nickname_employee_name?: string;

  @IsOptional()
  @IsString()
  nickname_vehicle_no?: string;

  @IsOptional()
  @IsBoolean()
  nickname_is_active?: boolean;
}

export class UpdateNicknameMappingDto {
  @IsOptional()
  @IsString()
  nickname_value?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  nickname_employee_id?: number;

  @IsOptional()
  @IsString()
  nickname_employee_name?: string;

  @IsOptional()
  @IsString()
  nickname_vehicle_no?: string;

  @IsOptional()
  @IsBoolean()
  nickname_is_active?: boolean;
}

export class NicknameMappingQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  vehicle_no?: string;
}
