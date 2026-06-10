-- Add optional date for custom payroll adjustments linked from the daily calculation tab
ALTER TABLE "payroll_adjustments" ADD COLUMN IF NOT EXISTS "adjustment_date" DATE;
