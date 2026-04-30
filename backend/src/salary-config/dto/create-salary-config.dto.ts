import { IsOptional, IsString, IsNumber, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSalaryConfigDto {
  @IsOptional() @Type(() => Number) @IsNumber() employee_id?: number;
  @IsOptional() @IsString() effective_date?: string;
  @IsOptional() @Type(() => Number) @IsNumber() base_salary?: number;
  @IsOptional() @Type(() => Number) @IsNumber() base_salary_night?: number;
  @IsOptional() @IsString() salary_type?: string;
  @IsOptional() @Type(() => Number) @IsNumber() allowance_night?: number;
  @IsOptional() @Type(() => Number) @IsNumber() allowance_rent?: number;
  @IsOptional() @Type(() => Number) @IsNumber() allowance_3runway?: number;
  @IsOptional() @Type(() => Number) @IsNumber() ot_rate_standard?: number;
  @IsOptional() @Type(() => Number) @IsNumber() allowance_well?: number;
  @IsOptional() @Type(() => Number) @IsNumber() allowance_machine?: number;
  @IsOptional() @Type(() => Number) @IsNumber() allowance_roller?: number;
  @IsOptional() @Type(() => Number) @IsNumber() allowance_crane?: number;
  @IsOptional() @Type(() => Number) @IsNumber() allowance_move_machine?: number;
  @IsOptional() @Type(() => Number) @IsNumber() allowance_kwh_night?: number;
  @IsOptional() @Type(() => Number) @IsNumber() allowance_mid_shift?: number;
  @IsOptional() @Type(() => Number) @IsNumber() ot_1800_1900?: number;
  @IsOptional() @Type(() => Number) @IsNumber() ot_1900_2000?: number;
  @IsOptional() @Type(() => Number) @IsNumber() ot_0600_0700?: number;
  @IsOptional() @Type(() => Number) @IsNumber() ot_0700_0800?: number;
  @IsOptional() @Type(() => Number) @IsNumber() ot_mid_shift?: number;
  @IsOptional() @Type(() => Number) @IsNumber() mid_shift_ot_allowance?: number;
  @IsOptional() custom_allowances?: any;
  @IsOptional() @IsBoolean() is_piece_rate?: boolean;
  @IsOptional() @Type(() => Number) @IsNumber() fleet_rate_card_id?: number;
  @IsOptional() @IsString() change_type?: string;
  @IsOptional() @Type(() => Number) @IsNumber() change_amount?: number;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateSalaryConfigDto extends CreateSalaryConfigDto {}
