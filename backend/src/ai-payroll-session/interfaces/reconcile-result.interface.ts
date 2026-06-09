import { StandardizedSourceRecordData } from './source-record.interface';

export type AiPayrollSessionStatus =
  | 'pending'
  | 'collecting'
  | 'recognizing'
  | 'reconciling'
  | 'calculating'
  | 'completed'
  | 'needs_review'
  | 'confirmed'
  | 'failed'
  | 'cancelled';

export type AiPayrollQuestionType =
  | 'location_conflict'
  | 'ot_conflict'
  | 'work_type_uncertain'
  | 'missing_source'
  | 'ocr_error'
  | 'data_conflict'
  | 'other';

export type AiPayrollQuestionSeverity = 'info' | 'warning' | 'critical';

export type AiPayrollReconcileStatus =
  | 'pending'
  | 'matched'
  | 'conflict'
  | 'needs_review'
  | 'confirmed'
  | 'excluded';

export interface AiDecisionAction {
  field?: string;
  value?: string | number | boolean | null;
  confidence?: number;
  reason?: string;
}

export interface ReconcileSourceComparison {
  source_count: number;
  source_types: string[];
  agreed_fields: string[];
  conflicted_fields: string[];
  missing_fields: string[];
  base_source_type?: string | null;
  ai_summary?: string | null;
}

export interface ReconcileDecisionResult {
  status: AiPayrollReconcileStatus;
  decidedData: StandardizedSourceRecordData & {
    work_type_decided?: string | null;
    decision_method?: string | null;
    sources_agreed?: string[];
    sources_disagreed?: string[];
  };
  comparison: ReconcileSourceComparison;
  decisionReason: string;
  workType?: string | null;
  hasOt: boolean;
  otHours?: number | null;
  isFromOcr: boolean;
  questions: ReconcileQuestionDraft[];
}

export interface ReconcileQuestionDraft {
  employeeId?: number | null;
  date?: string | null;
  type: AiPayrollQuestionType;
  severity: AiPayrollQuestionSeverity;
  text: string;
  context?: Record<string, unknown> | null;
  aiDecision?: string | null;
  aiAction?: AiDecisionAction | null;
}

export interface PayrollPreviewItem {
  employee_id: number;
  employee_name?: string | null;
  date_from: string;
  date_to: string;
  reconcile_item_count: number;
  confirmed_item_count: number;
  can_generate: boolean;
  warnings: string[];
}
