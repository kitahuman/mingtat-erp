import { IsOptional, IsString, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateRetentionReleaseDto {
  @IsString() release_date: string;
  @Type(() => Number) @IsNumber() amount: number;
  @IsString() reason: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() status?: string;
}
