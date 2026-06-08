import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateKnowledgeEvidenceDto {
  @ApiProperty({ example: 'ai-payroll' })
  @IsString()
  @MaxLength(50)
  sourceModuleCode!: string;

  @ApiProperty({ example: 'ai_payroll_entry_field' })
  @IsString()
  @MaxLength(80)
  sourceEntityType!: string;

  @ApiProperty({ example: 123 })
  @Type(() => Number)
  @IsInt()
  sourceEntityId!: number;

  @ApiPropertyOptional({ example: '荔枝角' })
  @IsOptional()
  @IsString()
  beforeValue?: string;

  @ApiPropertyOptional({ example: '荔枝角地盤' })
  @IsOptional()
  @IsString()
  afterValue?: string;

  @ApiProperty({ example: '人工修正地盤名稱後生成的知識證據' })
  @IsString()
  summary!: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  weight?: number;
}

export class CreateKnowledgeEntryDto {
  @ApiProperty({ enum: ['global', 'module'], example: 'module' })
  @IsString()
  @IsIn(['global', 'module'])
  moduleScope!: string;

  @ApiPropertyOptional({ example: 'ai-payroll' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  moduleCode?: string;

  @ApiProperty({ example: 'field_correction' })
  @IsString()
  @MaxLength(50)
  category!: string;

  @ApiProperty({ example: '地盤簡稱「蓮麻坑」應標準化為「蓮麻坑地盤」' })
  @IsString()
  @MaxLength(255)
  title!: string;

  @ApiProperty({ example: '當 AI 在功課紙中讀到「蓮麻坑」時，可優先配對到標準地盤名稱。' })
  @IsString()
  description!: string;

  @ApiProperty({ type: Object, example: { fieldName: 'site', rawValue: '蓮麻坑', normalizedValue: '蓮麻坑地盤' } })
  @IsObject()
  payload!: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'site' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  appliesToEntityType?: string;

  @ApiPropertyOptional({ example: 88 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  appliesToEntityId?: number;

  @ApiPropertyOptional({ type: [String], example: ['蓮麻坑', '地盤', 'site'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keywords?: string[];

  @ApiPropertyOptional({ example: 80 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  confidenceScore?: number;

  @ApiPropertyOptional({ enum: ['candidate', 'pending_review', 'approved', 'rejected', 'disabled'], example: 'approved' })
  @IsOptional()
  @IsString()
  @IsIn(['candidate', 'pending_review', 'approved', 'rejected', 'disabled'])
  status?: string;

  @ApiPropertyOptional({ example: '2026-06-01' })
  @IsOptional()
  @IsString()
  effectiveFrom?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsString()
  effectiveTo?: string;

  @ApiPropertyOptional({ enum: ['manual', 'ai', 'system'], example: 'manual' })
  @IsOptional()
  @IsString()
  @IsIn(['manual', 'ai', 'system'])
  createdByType?: string;

  @ApiPropertyOptional({ type: [CreateKnowledgeEvidenceDto] })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateKnowledgeEvidenceDto)
  evidence?: CreateKnowledgeEvidenceDto[];
}
