-- Add quotation_id to daily_reports table
ALTER TABLE "daily_reports" ADD COLUMN IF NOT EXISTS "daily_report_quotation_id" INTEGER;

-- Add foreign key constraint
ALTER TABLE "daily_reports"
  ADD CONSTRAINT "daily_reports_daily_report_quotation_id_fkey"
  FOREIGN KEY ("daily_report_quotation_id")
  REFERENCES "quotations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
