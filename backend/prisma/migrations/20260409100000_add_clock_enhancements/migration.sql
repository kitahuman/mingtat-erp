-- Migration: Add clock enhancements
-- 1. Add is_mid_shift (中直) to employee_attendances
-- 2. Add work_notes (工作備註) to employee_attendances
-- 3. Add role_title (職位) to employees for temporary employee position

ALTER TABLE "employee_attendances"
  ADD COLUMN IF NOT EXISTS "is_mid_shift" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "work_notes" TEXT;

ALTER TABLE "employees"
  ADD COLUMN IF NOT EXISTS "role_title" VARCHAR(100);
