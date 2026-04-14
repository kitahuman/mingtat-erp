import { IsOptional, IsString, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateLeaveDto {
  @IsOptional() @Type(() => Number) @IsNumber() employee_id?: number;
  @IsOptional() @IsString() leave_type?: string;
  @IsOptional() @IsString() date_from?: string;
  @IsOptional() @IsString() date_to?: string;
  @IsOptional() @Type(() => Number) @IsNumber() days?: number;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() remarks?: string;
}
