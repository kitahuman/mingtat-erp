import { IsOptional, IsString, IsNumber, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSubconFleetDriverDto {
  @IsOptional() @Type(() => Number) @IsNumber() subcontractor_id?: number;
  @IsOptional() @IsString() short_name?: string;
  @IsOptional() @IsString() name_zh?: string;
  @IsOptional() @IsString() name_en?: string;
  @IsOptional() @IsString() id_number?: string;
  @IsOptional() @IsString() machine_type?: string;
  @IsOptional() @IsString() plate_no?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() date_of_birth?: string;
  @IsOptional() @IsString() yellow_cert_no?: string;
  @IsOptional() @IsString() red_cert_no?: string;
  @IsOptional() @IsBoolean() has_d_cert?: boolean;
  @IsOptional() @IsBoolean() is_cert_returned?: boolean;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() status?: string;
}

export class UpdateSubconFleetDriverDto extends CreateSubconFleetDriverDto {}
