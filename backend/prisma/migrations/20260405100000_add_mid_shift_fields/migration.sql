-- Add is_mid_shift to work_logs
ALTER TABLE "work_logs" ADD COLUMN IF NOT EXISTS "is_mid_shift" BOOLEAN NOT NULL DEFAULT false;

-- Add is_mid_shift to payroll_work_logs
ALTER TABLE "payroll_work_logs" ADD COLUMN IF NOT EXISTS "is_mid_shift" BOOLEAN NOT NULL DEFAULT false;

-- Add matched_mid_shift_rate to payroll_work_logs
ALTER TABLE "payroll_work_logs" ADD COLUMN IF NOT EXISTS "matched_mid_shift_rate" DECIMAL(12, 2);

-- Add ot_line_amount to payroll_work_logs
ALTER TABLE "payroll_work_logs" ADD COLUMN IF NOT EXISTS "ot_line_amount" DECIMAL(12, 2) NOT NULL DEFAULT 0;

-- Add mid_shift_line_amount to payroll_work_logs
ALTER TABLE "payroll_work_logs" ADD COLUMN IF NOT EXISTS "mid_shift_line_amount" DECIMAL(12, 2) NOT NULL DEFAULT 0;
