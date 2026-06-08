import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateModulePolicyDto {
  @ApiPropertyOptional({ type: [String], example: ['field_correction', 'normalization_rule', 'payroll_hint'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedCategories?: string[];

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  maxEntriesPerTask?: number;

  @ApiPropertyOptional({ example: 4000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(500)
  @Max(20000)
  maxPromptCharacters?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  autoCandidateEnabled?: boolean;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  reviewThreshold?: number;
}
