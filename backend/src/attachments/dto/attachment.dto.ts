import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export const ATTACHMENT_ENTITY_TYPES = [
  'quotation',
  'invoice',
  'expense',
  'contract',
  'project',
] as const;

export type AttachmentEntityType = typeof ATTACHMENT_ENTITY_TYPES[number];

export class AttachmentEntityParamsDto {
  @IsIn(ATTACHMENT_ENTITY_TYPES)
  entityType!: AttachmentEntityType;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  entityId!: number;
}

export class ListAttachmentsQueryDto {
  @IsIn(ATTACHMENT_ENTITY_TYPES)
  entity_type!: AttachmentEntityType;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  entity_id!: number;
}

export class CreateAttachmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  attachment_description?: string;
}

export class UpdateAttachmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  attachment_description?: string;
}
