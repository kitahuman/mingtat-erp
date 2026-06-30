-- Create issue_reports table if not exists
CREATE TABLE IF NOT EXISTS "issue_reports" (
    "id" SERIAL NOT NULL,
    "issue_report_reporter_id" INTEGER,
    "issue_report_reporter_name" VARCHAR(100),
    "issue_report_reporter_role" VARCHAR(20),
    "issue_report_description" TEXT NOT NULL,
    "issue_report_url" VARCHAR(500),
    "issue_report_user_agent" VARCHAR(500),
    "issue_report_frontend_errors" JSONB,
    "issue_report_backend_errors" JSONB,
    "issue_report_screenshots" JSONB DEFAULT '[]'::jsonb,
    "issue_report_ai_analysis" TEXT,
    "issue_report_ai_status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "issue_report_ai_error" TEXT,
    "issue_report_status" VARCHAR(20) NOT NULL DEFAULT 'open',
    "issue_report_created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issue_report_updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "issue_reports_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "issue_reports_issue_report_reporter_id_idx" ON "issue_reports"("issue_report_reporter_id");
CREATE INDEX IF NOT EXISTS "issue_reports_issue_report_created_at_idx" ON "issue_reports"("issue_report_created_at");
CREATE INDEX IF NOT EXISTS "issue_reports_issue_report_status_idx" ON "issue_reports"("issue_report_status");
