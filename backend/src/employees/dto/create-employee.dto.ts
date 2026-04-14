import { IsOptional, IsString, IsNumber, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateEmployeeDto {
  @IsOptional() @IsString() base_salary?: string;
  @IsOptional() @Type(() => Number) @IsNumber() company_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() from_company_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() to_company_id?: number;
  @IsOptional() @IsString() emp_code?: string;
  @IsOptional() @IsString() name_zh?: string;
  @IsOptional() @IsString() name_en?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() id_number?: string;
  @IsOptional() @IsString() emergency_contact?: string;
  @IsOptional() @IsString() emergency_phone?: string;
  @IsOptional() @IsString() date_of_birth?: string;
  @IsOptional() @IsString() hire_date?: string;
  @IsOptional() @IsString() termination_date?: string;
  @IsOptional() @IsString() termination_reason?: string;
  @IsOptional() @IsString() gender?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() frequent_vehicle?: string;
  @IsOptional() @IsString() mpf_plan?: string;
  @IsOptional() @IsString() mpf_account_number?: string;
  @IsOptional() @IsString() mpf_employment_date?: string;
  @IsOptional() @IsString() mpf_old_employment_date?: string;
  @IsOptional() @IsString() salary_notes?: string;
  @IsOptional() @IsString() driving_license_no?: string;
  @IsOptional() @IsString() driving_license_expiry?: string;
  @IsOptional() @IsString() driving_license_class?: string;
  @IsOptional() @IsString() role_title?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsBoolean() employee_is_temporary?: boolean;
  @IsOptional() @IsBoolean() employee_mpf_applied?: boolean;
  @IsOptional() @IsString() employee_mpf_applied_date?: string;
  @IsOptional() @IsString() employee_photo_base64?: string;
  // All certificate fields
  @IsOptional() @IsString() approved_worker_cert_no?: string;
  @IsOptional() @IsString() approved_worker_cert_expiry?: string;
  @IsOptional() @IsString() green_card_no?: string;
  @IsOptional() @IsString() green_card_expiry?: string;
  @IsOptional() @IsString() construction_card_no?: string;
  @IsOptional() @IsString() construction_card_expiry?: string;
  @IsOptional() @IsString() earth_mover_cert_no?: string;
  @IsOptional() @IsString() earth_mover_cert_expiry?: string;
  @IsOptional() @IsString() excavator_cert_no?: string;
  @IsOptional() @IsString() excavator_cert_expiry?: string;
  @IsOptional() @IsString() crane_operator_cert_no?: string;
  @IsOptional() @IsString() crane_operator_cert_expiry?: string;
  @IsOptional() @IsString() lorry_crane_cert_no?: string;
  @IsOptional() @IsString() lorry_crane_cert_expiry?: string;
  @IsOptional() @IsString() crawler_crane_cert_no?: string;
  @IsOptional() @IsString() crawler_crane_cert_expiry?: string;
  @IsOptional() @IsString() hydraulic_crane_cert_no?: string;
  @IsOptional() @IsString() hydraulic_crane_cert_expiry?: string;
  @IsOptional() @IsString() airport_pass_no?: string;
  @IsOptional() @IsString() airport_pass_expiry?: string;
  @IsOptional() @IsString() gammon_pass_no?: string;
  @IsOptional() @IsString() gammon_pass_expiry?: string;
  @IsOptional() @IsString() leighton_pass_no?: string;
  @IsOptional() @IsString() leighton_pass_expiry?: string;
  @IsOptional() @IsString() confined_space_cert_no?: string;
  @IsOptional() @IsString() confined_space_cert_expiry?: string;
  @IsOptional() @IsString() compactor_cert_no?: string;
  @IsOptional() @IsString() compactor_cert_expiry?: string;
  @IsOptional() @IsString() slinging_silver_card_no?: string;
  @IsOptional() @IsString() slinging_silver_card_expiry?: string;
  @IsOptional() @IsString() craft_test_cert_no?: string;
  @IsOptional() @IsString() craft_test_cert_expiry?: string;
  @IsOptional() @IsString() compaction_load_cert_no?: string;
  @IsOptional() @IsString() compaction_load_cert_expiry?: string;
  @IsOptional() @IsString() aerial_platform_cert_no?: string;
  @IsOptional() @IsString() aerial_platform_cert_expiry?: string;
  @IsOptional() @IsString() site_rigging_a12_cert_no?: string;
  @IsOptional() @IsString() site_rigging_a12_cert_expiry?: string;
  @IsOptional() @IsString() slinging_signaler_a12s_cert_no?: string;
  @IsOptional() @IsString() slinging_signaler_a12s_cert_expiry?: string;
  @IsOptional() @IsString() zero_injury_cert_no?: string;
  @IsOptional() @IsString() zero_injury_cert_expiry?: string;
  @IsOptional() @IsString() designated_trade_safety_cert_no?: string;
  @IsOptional() @IsString() designated_trade_safety_cert_expiry?: string;
  @IsOptional() @IsString() small_loader_cert_expiry?: string;
  @IsOptional() @IsString() safety_supervisor_cert_expiry?: string;
  @IsOptional() @IsString() safe_work_procedure_cert_expiry?: string;
  @IsOptional() @IsString() grinding_wheel_cert_expiry?: string;
  @IsOptional() @IsString() ship_cargo_cert_expiry?: string;
  @IsOptional() @IsString() arc_welding_cert_expiry?: string;
  @IsOptional() @IsString() gas_welding_cert_expiry?: string;
  @IsOptional() @IsString() clp_safety_cert_expiry?: string;
  @IsOptional() other_certificates?: any;
  @IsOptional() cert_photos?: any;
}

export class UpdateEmployeeDto extends CreateEmployeeDto {}

export class TransferEmployeeDto {
  @Type(() => Number) @IsNumber() from_company_id: number;
  @Type(() => Number) @IsNumber() to_company_id: number;
  @IsString() transfer_date: string;
  @IsOptional() @IsString() notes?: string;
}

export class ConvertToRegularDto {
  @IsString() role: string;
  @Type(() => Number) @IsNumber() company_id: number;
  @IsOptional() @IsString() emp_code?: string;
  @IsOptional() @IsString() join_date?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() name_en?: string;
  @IsOptional() @Type(() => Number) @IsNumber() base_salary?: number;
  @IsOptional() @IsString() salary_type?: string;
}

export class AddSalarySettingDto {
  @IsOptional() @IsString() effective_date?: string;
  @IsOptional() @Type(() => Number) @IsNumber() base_salary?: number;
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
