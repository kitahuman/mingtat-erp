ALTER TABLE "issue_reports"
ADD COLUMN "issue_report_screenshots" JSONB DEFAULT '[]'::jsonb;
