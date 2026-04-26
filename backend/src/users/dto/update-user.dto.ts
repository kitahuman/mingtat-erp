import { IsString, IsEnum, IsOptional, IsBoolean, IsNumber, MinLength } from 'class-validator';
import { UserRole } from '../../auth/user-role.enum';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsNumber()
  employee_id?: number | null;

  @IsOptional()
  @IsBoolean()
  user_can_company_clock?: boolean;

  @IsOptional()
  @IsBoolean()
  can_approve_mid_shift?: boolean;

  @IsOptional()
  @IsBoolean()
  can_daily_report?: boolean;

  @IsOptional()
  @IsBoolean()
  can_acceptance_report?: boolean;

  @IsOptional()
  page_permissions?: PagePermissions | null;

  /**
   * When updating `phone`, controls whether the linked Employee's phone
   * should be updated together. Used by the user-management UI.
   *  - true  : also update employee.phone to the new value
   *  - false : leave employee.phone untouched (only update user login phone)
   *  - undefined : behave like the legacy update (no employee sync)
   */
  @IsOptional()
  @IsBoolean()
  sync_employee_phone?: boolean;
}

export interface PagePermissions {
  grant?: string[];
  deny?: string[];
}
