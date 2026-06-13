import { IsOptional, IsString, IsNumber, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateLeaveDto {
  @Type(() => Number) @IsNumber() @IsNotEmpty() employee_id!: number;
  @IsString() @IsNotEmpty() leave_type!: string; // "sick" | "annual"
  @IsString() @IsNotEmpty() date_from!: string;
  @IsString() @IsNotEmpty() date_to!: string;
  @IsOptional() @Type(() => Number) @IsNumber() days?: number;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() remarks?: string;
}
