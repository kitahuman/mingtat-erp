import { IsOptional, IsString, IsNumber, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateAttendanceDto {
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() timestamp?: string;
  @IsOptional() @IsString() photo_url?: string;
  @IsOptional() @IsString() attendance_photo_base64?: string;
  @IsOptional() @IsString() attendance_verification_method?: string;
  @IsOptional() @Type(() => Number) @IsNumber() attendance_verification_score?: number;
  @IsOptional() @Type(() => Number) @IsNumber() latitude?: number;
  @IsOptional() @Type(() => Number) @IsNumber() longitude?: number;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() remarks?: string;
  @IsOptional() @IsBoolean() is_mid_shift?: boolean;
  @IsOptional() @IsString() work_notes?: string;
}
