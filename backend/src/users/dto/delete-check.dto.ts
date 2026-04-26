/**
 * Response payload returned by GET /api/users/:id/check-delete.
 * Tells the frontend how many historical references exist so it can
 * decide whether to show a confirmation dialog.
 *
 * The numbers are **counts only** — no individual rows are returned to
 * keep the payload small and avoid leaking data.
 */
export class UserDeleteCheckResponseDto {
  user_id!: number;
  username!: string;
  display_name!: string;

  /** Records that link directly to this user via FK / Int columns. */
  related: UserDeleteRelatedCounts = {
    work_logs_published: 0,
    payrolls: 0,
    expenses: 0,
    payment_ins: 0,
    payment_outs: 0,
    daily_reports_created: 0,
    acceptance_reports_created: 0,
    audit_logs: 0,
    verification_confirmations: 0,
    employee_attendances: 0,
    employee_attendance_operator: 0,
    mid_shift_approvals: 0,
    employee_leaves_submitted: 0,
    employee_leaves_approved: 0,
    web_push_subscriptions: 0,
    deleted_record_marks: 0,
  };

  /** Aggregated total — convenient for the UI summary. */
  total!: number;

  /** True when no historical references exist; UI may hard-delete directly. */
  can_hard_delete!: boolean;

  /** Linked employee summary (if any), useful for messaging. */
  linked_employee?: {
    id: number;
    name_zh: string;
    name_en: string | null;
    emp_code: string | null;
  } | null;
}

export interface UserDeleteRelatedCounts {
  work_logs_published: number;
  payrolls: number;
  expenses: number;
  payment_ins: number;
  payment_outs: number;
  daily_reports_created: number;
  acceptance_reports_created: number;
  audit_logs: number;
  verification_confirmations: number;
  employee_attendances: number;
  employee_attendance_operator: number;
  mid_shift_approvals: number;
  employee_leaves_submitted: number;
  employee_leaves_approved: number;
  web_push_subscriptions: number;
  deleted_record_marks: number;
}
