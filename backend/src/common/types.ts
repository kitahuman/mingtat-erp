/**
 * 共用類型定義 — 逐步消除 any 類型
 * 優先處理 Service 層的返回值和 Controller 層的請求/回應型別
 */

// ── 分頁查詢 ──────────────────────────────────────────────────

export interface PaginationQuery {
  page?: string | number;
  limit?: string | number;
  search?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  sortBy?: string;
  sortOrder?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ── Work Logs ──────────────────────────────────────────────────

export interface WorkLogQuery extends PaginationQuery {
  company_id?: string | number;
  company_profile_id?: string | number;
  client_id?: string | number;
  employee_id?: string | number;
  contract_id?: string | number;
  project_id?: string | number;
  status?: string;
  is_confirmed?: string;
  is_paid?: string;
  date_from?: string;
  date_to?: string;
  day_night?: string;
  service_type?: string;
  machine_type?: string;
  tonnage?: string;
  [key: string]: string | number | undefined;
}

export interface WorkLogPriceMatch {
  matched_rate_card_id: number | null;
  matched_rate: number | null;
  matched_unit: string | null;
  matched_ot_rate: number | null;
  matched_mid_shift_rate: number | null;
  ot_line_amount: number;
  mid_shift_line_amount: number;
  price_match_status: 'matched' | 'unmatched';
  price_match_note: string | null;
}

// ── Employees ──────────────────────────────────────────────────

export interface EmployeeQuery extends PaginationQuery {
  company_id?: string | number;
  status?: string;
  type?: string;
  [key: string]: string | number | string[] | undefined;
}

export interface EmployeeFilterOptions {
  column: string;
  options: Array<{ value: string; label: string; count: number }>;
}

// ── Payroll ────────────────────────────────────────────────────

export interface PayrollQuery extends PaginationQuery {
  period?: string;
  company_profile_id?: string | number;
  company_id?: string | number;
  employee_id?: string | number;
  status?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PayrollSummary {
  count: number;
  total_base: number;
  total_allowance: number;
  total_ot: number;
  total_commission: number;
  total_mpf: number;
  total_net: number;
}

export interface DailyCalculation {
  date: string;
  work_logs: DailyWorkLogEntry[];
  work_income: number;
  base_salary: number;
  needs_top_up: boolean;
  top_up_amount: number;
  effective_income: number;
  daily_allowances: DailyAllowanceEntry[];
  daily_allowance_total: number;
  day_total: number;
}

export interface DailyWorkLogEntry {
  id: number;
  service_type: string | null;
  day_night: string | null;
  start_location: string | null;
  end_location: string | null;
  machine_type: string | null;
  tonnage: string | null;
  equipment_number: string | null;
  client_name: string;
  client_short_name: string | null;
  client_contract_no: string;
  quantity: number;
  ot_quantity: number;
  is_mid_shift: boolean;
  matched_rate: number | null;
  matched_ot_rate: number | null;
  matched_mid_shift_rate: number | null;
  line_amount: number;
  base_line_amount: number;
  ot_line_amount: number;
  mid_shift_line_amount: number;
  price_match_status: string;
}

export interface DailyAllowanceEntry {
  id: number;
  allowance_key: string;
  allowance_name: string;
  amount: number;
  remarks: string | null;
}

export interface AllowanceOption {
  key: string;
  label: string;
  default_amount: number;
}

export interface GroupedSettlement {
  group_key: string;
  service_type: string | null;
  day_night: string | null;
  start_location: string | null;
  end_location: string | null;
  machine_type: string | null;
  tonnage: string | null;
  client_contract_no: string | null;
  total_quantity: number;
  total_ot_quantity: number;
  mid_shift_count: number;
  total_line_amount: number;
  total_ot_line_amount: number;
  total_mid_shift_line_amount: number;
  matched_rate: number | null;
  matched_unit: string | null;
  matched_ot_rate: number | null;
  matched_mid_shift_rate: number | null;
  price_match_status: string;
  items: Array<{
    id: number;
    scheduled_date: string;
    quantity: number;
    ot_quantity: number;
    is_mid_shift: boolean;
    line_amount: number;
  }>;
}

// ── Invoices ───────────────────────────────────────────────────

export interface InvoiceQuery extends PaginationQuery {
  company_id?: string | number;
  client_id?: string | number;
  project_id?: string | number;
  status?: string;
  date_from?: string;
  date_to?: string;
}

export interface InvoiceItem {
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  amount: number;
  sort_order?: number;
}

// ── Request Context ────────────────────────────────────────────

/** Express Request with JWT user payload — extends standard Request */
export interface AuthenticatedRequest {
  user: {
    id: number;
    userId: number;
    username: string;
    role: string;
  };
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
  [key: string]: unknown;
}

// ── Prisma Where Clause helpers ────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WhereClause = Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type OrderByClause = any;
