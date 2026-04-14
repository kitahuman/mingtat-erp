import { IsOptional, IsString, IsNumber, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateVehicleDto {
  @IsOptional() @Type(() => Number) @IsNumber() from_company_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() to_company_id?: number;
  @IsOptional() @IsString() plate_number?: string;
  @IsOptional() @IsString() machine_type?: string;
  @IsOptional() @Type(() => Number) @IsNumber() tonnage?: number;
  @IsOptional() @Type(() => Number) @IsNumber() owner_company_id?: number;
  @IsOptional() @IsString() insurance_expiry?: string;
  @IsOptional() @IsString() permit_fee_expiry?: string;
  @IsOptional() @IsString() inspection_date?: string;
  @IsOptional() @IsString() license_expiry?: string;
  @IsOptional() @IsString() brand?: string;
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() vehicle_first_reg_date?: string;
  @IsOptional() @IsString() vehicle_chassis_no?: string;
  @IsOptional() @IsString() vehicle_electronic_comm?: string;
  @IsOptional() @IsString() vehicle_autotoll_collected?: string;
  @IsOptional() @IsString() vehicle_autotoll?: string;
  @IsOptional() @IsString() vehicle_inspection_notes?: string;
  @IsOptional() @IsString() vehicle_insurance_agent?: string;
  @IsOptional() @IsString() vehicle_insurance_company?: string;
  @IsOptional() @IsBoolean() vehicle_has_gps?: boolean;
  @IsOptional() @IsString() vehicle_mud_tail_expiry?: string;
  @IsOptional() @IsString() vehicle_original_plate?: string;
  @IsOptional() @IsString() vehicle_owner_name?: string;
}

export class UpdateVehicleDto extends CreateVehicleDto {}

export class ChangePlateDto {
  @IsString() new_plate: string;
  @IsString() change_date: string;
  @IsOptional() @IsString() reason?: string;
}

export class TransferVehicleDto {
  @Type(() => Number) @IsNumber() from_company_id: number;
  @Type(() => Number) @IsNumber() to_company_id: number;
  @IsString() transfer_date: string;
  @IsOptional() @IsString() reason?: string;
}
