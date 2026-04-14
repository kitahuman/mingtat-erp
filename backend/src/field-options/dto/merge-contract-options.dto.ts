import { IsArray, IsNumber, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';

export class MergeContractOptionsDto {
  @IsNumber()
  @Type(() => Number)
  primaryId: number;

  @IsArray()
  @IsNumber({}, { each: true })
  @ArrayMinSize(1)
  @Type(() => Number)
  mergeIds: number[];
}
