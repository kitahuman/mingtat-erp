import { IsIn, IsOptional, IsString } from 'class-validator';

export const PIVOT_DIMENSIONS = [
  'none',
  'employee',
  'equipment_number',
  'client',
  'company',
  'machine_type',
  'start_location',
  'end_location',
  'contract',
  'quotation',
  'scheduled_date',
  'week',
  'month',
  'day_night',
  'service_type',
] as const;

export const PIVOT_VALUE_TYPES = [
  'count',
  'quantity_sum',
  'ot_sum',
  'mid_shift_count',
] as const;

export type PivotDimension = (typeof PIVOT_DIMENSIONS)[number];
export type PivotValueType = (typeof PIVOT_VALUE_TYPES)[number];

export class WorkLogPivotQueryDto {
  @IsOptional() @IsString() date_from?: string;
  @IsOptional() @IsString() date_to?: string;

  @IsOptional() @IsString() row_fields?: string;
  @IsOptional() @IsString() col_fields?: string;

  @IsOptional() @IsIn(PIVOT_VALUE_TYPES) value_type?: PivotValueType;

  @IsOptional() @IsString() company_id?: string;
  @IsOptional() @IsString() client_id?: string;
  @IsOptional() @IsString() employee_id?: string;
  @IsOptional() @IsString() machine_type?: string;
  @IsOptional() @IsString() tonnage?: string;
  @IsOptional() @IsString() day_night?: string;
  @IsOptional() @IsString() service_type?: string;
  @IsOptional() @IsString() status?: string;
}

export interface PivotAxisItem {
  key: string;
  values: string[];
  labels: string[];
}

export interface PivotMetric {
  value: number;
  unit: string;
}

export interface WorkLogPivotSummary {
  totalRecords: number;
  confirmedCount: number;
  totalQuantity: number;
  priceMatchRate: number;
  employeeCount: number;
  equipmentCount: number;
}

export interface WorkLogPivotResult {
  rows: PivotAxisItem[];
  cols: PivotAxisItem[];
  data: Record<string, PivotMetric>;
  rowTotals: Record<string, PivotMetric>;
  colTotals: Record<string, PivotMetric>;
  grandTotal: PivotMetric;
  summary: WorkLogPivotSummary;
}
