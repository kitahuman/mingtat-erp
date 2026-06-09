import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AnswerQuestionDto {
  @ApiProperty({ example: '以功課紙為準，地點應為將軍澳。' })
  @IsString()
  answer!: string;
}

export class BatchDismissQuestionsDto {
  @ApiProperty({ example: [1, 2, 3], type: [Number] })
  @IsArray()
  @ArrayNotEmpty()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  question_ids!: number[];
}

export class QueryQuestionsDto {
  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @Type(() => Boolean)
  resolved?: boolean;

  @ApiPropertyOptional({ example: 'location_conflict' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  employee_id?: number;
}
