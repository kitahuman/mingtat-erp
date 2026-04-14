import { IsOptional, IsString, IsBoolean } from 'class-validator';

export class CreateBankAccountDto {
  @IsString() account_name: string;
  @IsString() bank_name: string;
  @IsString() account_no: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsBoolean() is_active?: boolean;
  @IsOptional() @IsString() remarks?: string;
}

export class UpdateBankAccountDto {
  @IsOptional() @IsString() account_name?: string;
  @IsOptional() @IsString() bank_name?: string;
  @IsOptional() @IsString() account_no?: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsBoolean() is_active?: boolean;
  @IsOptional() @IsString() remarks?: string;
}
