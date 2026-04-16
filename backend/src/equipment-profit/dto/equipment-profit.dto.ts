import { IsOptional, IsString, IsNumber, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class EquipmentProfitReportQueryDto {
  @IsOptional() @IsString() date_from?: string;
  @IsOptional() @IsString() date_to?: string;
  @IsOptional() @IsString() @IsIn(['machinery', 'vehicle']) equipment_type?: string;
  @IsOptional() @Type(() => Number) @IsNumber() equipment_id?: number;
}

export class UpdateCommissionDto {
  @Type(() => Number)
  @IsNumber()
  commission_percentage: number;
}

export interface EquipmentProfitSummary {
  equipment_type: string;
  equipment_id: number;
  equipment_code: string;
  machine_type: string | null;
  tonnage: number | null;
  gross_revenue: number;
  commission_percentage: number;
  company_revenue: number;
  total_expense: number;
  profit_loss: number;
}

export interface EquipmentProfitDetail {
  equipment_type: string;
  equipment_id: number;
  equipment_code: string;
  machine_type: string | null;
  tonnage: number | null;
  brand: string | null;
  model: string | null;
  status: string;
  owner_company: string | null;
  commission_percentage: number;
  gross_revenue: number;
  company_revenue: number;
  total_expense: number;
  profit_loss: number;
  work_logs: WorkLogDetail[];
  expenses: ExpenseDetail[];
}

export interface WorkLogDetail {
  id: number;
  scheduled_date: string | null;
  service_type: string | null;
  machine_type: string | null;
  equipment_number: string | null;
  day_night: string | null;
  start_location: string | null;
  end_location: string | null;
  quantity: number | null;
  unit: string | null;
  ot_quantity: number | null;
  ot_unit: string | null;
  matched_rate: number | null;
  matched_ot_rate: number | null;
  line_amount: number;
  client_name: string | null;
  employee_name: string | null;
}

export interface ExpenseDetail {
  id: number;
  date: string;
  item: string | null;
  category_name: string | null;
  supplier_name: string | null;
  total_amount: number;
  remarks: string | null;
}
