import { IsString, IsEnum, IsOptional, IsBoolean, MinLength } from 'class-validator';
import { UserRole } from '../../auth/user-role.enum';

export class CreateUserDto {
  @IsString()
  @MinLength(3)
  username: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  displayName: string;

  @IsEnum(UserRole)
  role: UserRole;

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
}
