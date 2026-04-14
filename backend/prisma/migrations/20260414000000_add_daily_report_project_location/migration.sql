-- Add daily_report_project_location to daily_reports table
ALTER TABLE "daily_reports" ADD COLUMN IF NOT EXISTS "daily_report_project_location" VARCHAR(200);
