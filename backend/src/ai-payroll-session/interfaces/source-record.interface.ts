export type AiPayrollSourceType =
  | 'work_log'
  | 'homework_sheet'
  | 'clock'
  | 'whatsapp_order'
  | 'receipt'
  | 'gps'
  | 'manual'
  | 'system';

export interface OcrSourceIssue {
  code: 'ocr_employee_unmatched' | 'ocr_date_corrected' | 'ocr_date_missing';
  label: string;
  severity: 'info' | 'warning';
  message: string;
  raw_employee_name?: string | null;
  original_date?: string | null;
  corrected_date?: string | null;
  original_year?: number | null;
  corrected_year?: number | null;
}

export interface StandardizedSourceRecordData {
  employee_id: number;
  employee_name?: string | null;
  date: string;
  service_type?: string | null;
  day_night?: string | null;
  start_location?: string | null;
  end_location?: string | null;
  machine_type?: string | null;
  tonnage?: string | null;
  equipment_number?: string | null;
  quantity?: number | null;
  unit?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  ot_quantity?: number | null;
  ot_unit?: string | null;
  is_mid_shift?: boolean | null;
  work_content?: string | null;
  client_name?: string | null;
  contract_no?: string | null;
  remarks?: string | null;
  source_label?: string | null;
  source_status?: string | null;
  match_basis?: string | null;
  address?: string | null;
  clock_type?: string | null;
  timestamp?: string | null;
  distance?: number | null;
  trip_count?: number | null;
  locations?: unknown;
  raw_items?: unknown;
  raw_summary?: string | null;
  raw_employee_name?: string | null;
  original_work_date?: string | null;
  corrected_work_date?: string | null;
  ocr_issues?: OcrSourceIssue[];
  work_type_decided?: string | null;
  decision_method?: string | null;
  sources_agreed?: string[];
  sources_disagreed?: string[];
}

export interface PayrollSourceRecordInput {
  sessionId: number;
  employeeId: number;
  date: string;
  sourceType: AiPayrollSourceType;
  sourceId?: number | null;
  data: StandardizedSourceRecordData;
  rawData?: Record<string, unknown> | null;
  confidence?: number | null;
}

export interface SourceSummaryByEmployee {
  employee_id: number;
  employee_name?: string | null;
  total: number;
  by_source_type: Record<string, number>;
  dates: string[];
}
