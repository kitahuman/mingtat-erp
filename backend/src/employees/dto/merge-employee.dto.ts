import { IsNumber, IsBoolean, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class MergeEmployeeDto {
  @Type(() => Number)
  @IsNumber()
  target_employee_id: number;

  @IsOptional()
  @IsBoolean()
  force_overwrite_salary?: boolean;
}

export interface MergeCheckRecord {
  work_logs: number;
  payrolls: number;
  attendances: number;
  leaves: number;
  expenses: number;
  attendance_anomalies: number;
  verification_records: number;
  verification_nickname_mappings: number;
}

export interface SalaryConflictInfo {
  has_conflict: boolean;
  source_salary: {
    id: number;
    base_salary: number;
    salary_type: string;
    effective_date: Date;
  } | null;
  target_salary: {
    id: number;
    base_salary: number;
    salary_type: string;
    effective_date: Date;
  } | null;
}

export interface MergeCheckResponse {
  source_employee: {
    id: number;
    name_zh: string;
    name_en: string | null;
    phone: string | null;
    created_at: Date;
  };
  target_employee: {
    id: number;
    name_zh: string;
    name_en: string | null;
    emp_code: string | null;
    role: string;
    company_name: string | null;
  };
  records: MergeCheckRecord;
  total_records: number;
  salary_conflict: SalaryConflictInfo;
}

export interface MergeExecuteResponse {
  success: boolean;
  transferred: MergeCheckRecord;
  total_transferred: number;
  deleted_source_id: number;
}
