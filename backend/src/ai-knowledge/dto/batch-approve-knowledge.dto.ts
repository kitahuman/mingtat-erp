import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsInt, IsOptional, IsString } from 'class-validator';

export class BatchApproveKnowledgeDto {
  @ApiPropertyOptional({ example: [1, 2, 3], description: '知識條目 ID 列表' })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  ids?: number[];

  @ApiPropertyOptional({ example: [1, 2, 3], description: '前端/舊版 alias：知識條目 ID 列表' })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  entryIds?: number[];

  @ApiPropertyOptional({ example: '批量審核通過' })
  @IsOptional()
  @IsString()
  reason?: string;
}
