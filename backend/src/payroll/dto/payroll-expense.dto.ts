import { IsNotEmpty, IsArray, ArrayMinSize, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class AttachPayrollExpensesDto {
  @IsNotEmpty()
  @IsArray()
  @ArrayMinSize(1)
  @Type(() => Number)
  @IsNumber({}, { each: true })
  expense_ids: number[];
}

export class GenerateMpfEmployerExpenseDto {
  @IsNotEmpty()
  @IsArray()
  @ArrayMinSize(1)
  @Type(() => Number)
  @IsNumber({}, { each: true })
  payroll_ids: number[];
}
