import { IsOptional, IsString, IsBoolean, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePaymentInSourceTypeDto {
  @IsString() code: string;
  @IsString() label: string;
  @IsOptional() @IsBoolean() is_system?: boolean;
  @IsOptional() @IsBoolean() has_recalculation?: boolean;
  @IsOptional() @IsBoolean() is_active?: boolean;
  @IsOptional() @Type(() => Number) @IsNumber() sort_order?: number;
}

export class UpdatePaymentInSourceTypeDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() label?: string;
  @IsOptional() @IsBoolean() has_recalculation?: boolean;
  @IsOptional() @IsBoolean() is_active?: boolean;
  @IsOptional() @Type(() => Number) @IsNumber() sort_order?: number;
}
