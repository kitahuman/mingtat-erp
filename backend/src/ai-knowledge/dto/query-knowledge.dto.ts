import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class QueryKnowledgeDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  @ApiPropertyOptional({ example: 'ai-payroll' })
  @IsOptional()
  @IsString()
  moduleCode?: string;

  @ApiPropertyOptional({ example: 'field_correction' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: 'approved' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: '蓮麻坑' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: 'site' })
  @IsOptional()
  @IsString()
  entityType?: string;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  entityId?: number;

  @ApiPropertyOptional({ enum: ['createdAt', 'updatedAt', 'usageCount', 'supportCount', 'confidenceScore'], example: 'updatedAt' })
  @IsOptional()
  @IsString()
  @IsIn(['createdAt', 'updatedAt', 'usageCount', 'supportCount', 'confidenceScore'])
  sortBy?: string = 'updatedAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], example: 'desc' })
  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}
