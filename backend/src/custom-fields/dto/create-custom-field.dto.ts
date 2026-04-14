import { IsOptional, IsString, IsNumber, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCustomFieldDto {
  @IsOptional() @IsString() module?: string;
  @IsOptional() @IsString() field_name?: string;
  @IsOptional() @IsString() field_label?: string;
  @IsOptional() @IsString() field_type?: string;
  @IsOptional() @Type(() => Number) @IsNumber() sort_order?: number;
  @IsOptional() @IsBoolean() is_required?: boolean;
  @IsOptional() options?: any;
}

export class UpdateCustomFieldDto extends CreateCustomFieldDto {}

export class BatchUpdateValuesDto {
  @IsOptional() @IsString() module?: string;
  @IsOptional() @Type(() => Number) @IsNumber() entity_id?: number;
  @IsOptional() values?: any;
}
