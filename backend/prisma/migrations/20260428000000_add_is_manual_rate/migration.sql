-- Add is_manual_rate to payroll_work_logs table
ALTER TABLE "payroll_work_logs" ADD COLUMN IF NOT EXISTS "is_manual_rate" BOOLEAN NOT NULL DEFAULT false;
