import { IsString, IsEnum, IsOptional, IsBoolean, IsNumber, MinLength } from 'class-validator';
import { UserRole } from '../../auth/user-role.enum';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

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
}
