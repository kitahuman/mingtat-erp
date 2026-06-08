import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class MatchEmployeeDto {
  @ApiProperty({ example: 12 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  employeeId!: number;

  @ApiPropertyOptional({ example: '姓名與電話均相符' })
  @IsOptional()
  @IsString()
  reason?: string;
}
