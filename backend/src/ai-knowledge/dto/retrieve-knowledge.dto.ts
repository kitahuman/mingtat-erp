import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class RetrieveKnowledgeContextDto {
  @ApiPropertyOptional({ example: 'attendance_sheet' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  formType?: string;

  @ApiPropertyOptional({ type: [Object], example: [{ employeeId: 12, name: '陳大文', score: 0.92 }] })
  @IsOptional()
  @IsArray()
  employeeCandidates?: Record<string, unknown>[];

  @ApiPropertyOptional({ type: [String], example: ['蓮麻坑', 'OT 2', '中食'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  rawTexts?: string[];

  @ApiPropertyOptional({ type: [String], example: ['site', 'overtimeHours'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fieldNames?: string[];

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  siteId?: number;

  @ApiPropertyOptional({ example: 7 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  vehicleId?: number;

  @ApiPropertyOptional({ type: Object, example: { payrollMonth: '2026-06' } })
  @IsOptional()
  @IsObject()
  extra?: Record<string, unknown>;
}

export class RetrieveKnowledgeLimitsDto {
  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  maxEntries?: number;

  @ApiPropertyOptional({ example: 4000, minimum: 500, maximum: 20000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(500)
  @Max(20000)
  maxPromptCharacters?: number;
}

export class RetrieveKnowledgeDto {
  @ApiProperty({ example: 'ai-payroll' })
  @IsString()
  @MaxLength(50)
  moduleCode!: string;

  @ApiProperty({ example: 'payroll_vision_extraction' })
  @IsString()
  @MaxLength(80)
  taskType!: string;

  @ApiProperty({ type: RetrieveKnowledgeContextDto })
  @ValidateNested()
  @Type(() => RetrieveKnowledgeContextDto)
  context!: RetrieveKnowledgeContextDto;

  @ApiPropertyOptional({ type: RetrieveKnowledgeLimitsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RetrieveKnowledgeLimitsDto)
  limits?: RetrieveKnowledgeLimitsDto;
}

export class RetrievedKnowledgeEntryDto {
  entryId!: number;
  category!: string;
  moduleScope!: string;
  title!: string;
  retrievalScore!: number;
  promptSnippet!: string;
  payload!: Record<string, unknown>;
}

export class RetrieveKnowledgeResponseDto {
  knowledgeContextId!: string;
  entries!: RetrievedKnowledgeEntryDto[];
}
