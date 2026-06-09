-- Migration: 20260609000000_add_ai_payroll_sessions

-- 1. AI 計糧會話
CREATE TABLE "ai_payroll_sessions" (
    "id" SERIAL NOT NULL,
    "session_company_id" INTEGER NOT NULL,
    "session_period" VARCHAR(7) NOT NULL,
    "session_date_from" DATE NOT NULL,
    "session_date_to" DATE NOT NULL,
    "session_employee_ids" JSONB NOT NULL DEFAULT '[]',
    "session_status" VARCHAR(30) NOT NULL DEFAULT 'pending',
    "session_current_step" INTEGER NOT NULL DEFAULT 1,
    "session_error_message" TEXT,
    "session_sources_summary" JSONB,
    "session_reconcile_result" JSONB,
    "session_ai_decisions" JSONB,
    "session_payroll_ids" JSONB,
    "session_document_ids" JSONB,
    "session_created_by" INTEGER,
    "session_created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "session_updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_payroll_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_payroll_sessions_company_id_idx" ON "ai_payroll_sessions"("session_company_id");
CREATE INDEX "ai_payroll_sessions_period_idx" ON "ai_payroll_sessions"("session_period");
CREATE INDEX "ai_payroll_sessions_status_idx" ON "ai_payroll_sessions"("session_status");
CREATE INDEX "ai_payroll_sessions_created_at_idx" ON "ai_payroll_sessions"("session_created_at");

-- 2. AI 計糧問題
CREATE TABLE "ai_payroll_questions" (
    "id" SERIAL NOT NULL,
    "question_session_id" INTEGER NOT NULL,
    "question_employee_id" INTEGER,
    "question_date" DATE,
    "question_type" VARCHAR(30) NOT NULL,
    "question_severity" VARCHAR(20) NOT NULL DEFAULT 'info',
    "question_text" TEXT NOT NULL,
    "question_context" JSONB,
    "question_ai_decision" TEXT,
    "question_ai_action" JSONB,
    "question_user_answer" TEXT,
    "question_resolved" BOOLEAN NOT NULL DEFAULT false,
    "question_resolved_at" TIMESTAMPTZ,
    "question_knowledge_entry_id" INTEGER,
    "question_created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_payroll_questions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_payroll_questions_session_id_idx" ON "ai_payroll_questions"("question_session_id");
CREATE INDEX "ai_payroll_questions_employee_id_idx" ON "ai_payroll_questions"("question_employee_id");
CREATE INDEX "ai_payroll_questions_resolved_idx" ON "ai_payroll_questions"("question_resolved");
CREATE INDEX "ai_payroll_questions_type_idx" ON "ai_payroll_questions"("question_type");
CREATE INDEX "ai_payroll_questions_created_at_idx" ON "ai_payroll_questions"("question_created_at");

-- 3. AI 計糧來源紀錄
CREATE TABLE "ai_payroll_source_records" (
    "id" SERIAL NOT NULL,
    "source_record_session_id" INTEGER NOT NULL,
    "source_record_employee_id" INTEGER NOT NULL,
    "source_record_date" DATE NOT NULL,
    "source_record_source_type" VARCHAR(30) NOT NULL,
    "source_record_source_id" INTEGER,
    "source_record_data" JSONB NOT NULL DEFAULT '{}',
    "source_record_raw_data" JSONB,
    "source_record_confidence" DECIMAL(5,2),
    "source_record_created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_payroll_source_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_payroll_source_records_session_id_idx" ON "ai_payroll_source_records"("source_record_session_id");
CREATE INDEX "ai_payroll_source_records_employee_id_idx" ON "ai_payroll_source_records"("source_record_employee_id");
CREATE INDEX "ai_payroll_source_records_date_idx" ON "ai_payroll_source_records"("source_record_date");
CREATE INDEX "ai_payroll_source_records_source_type_idx" ON "ai_payroll_source_records"("source_record_source_type");
CREATE INDEX "ai_payroll_source_records_composite_idx" ON "ai_payroll_source_records"("source_record_session_id", "source_record_employee_id", "source_record_date");

-- 4. AI 計糧核對項目
CREATE TABLE "ai_payroll_reconcile_items" (
    "id" SERIAL NOT NULL,
    "reconcile_session_id" INTEGER NOT NULL,
    "reconcile_employee_id" INTEGER NOT NULL,
    "reconcile_date" DATE NOT NULL,
    "reconcile_status" VARCHAR(30) NOT NULL DEFAULT 'pending',
    "reconcile_work_log_id" INTEGER,
    "reconcile_decided_data" JSONB NOT NULL DEFAULT '{}',
    "reconcile_source_comparison" JSONB,
    "reconcile_decision_reason" TEXT,
    "reconcile_work_type" VARCHAR(30),
    "reconcile_has_ot" BOOLEAN DEFAULT false,
    "reconcile_ot_hours" DECIMAL(5,2),
    "reconcile_is_from_ocr" BOOLEAN DEFAULT false,
    "reconcile_user_override" JSONB,
    "reconcile_created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reconcile_updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_payroll_reconcile_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_payroll_reconcile_items_session_id_idx" ON "ai_payroll_reconcile_items"("reconcile_session_id");
CREATE INDEX "ai_payroll_reconcile_items_employee_id_idx" ON "ai_payroll_reconcile_items"("reconcile_employee_id");
CREATE INDEX "ai_payroll_reconcile_items_date_idx" ON "ai_payroll_reconcile_items"("reconcile_date");
CREATE INDEX "ai_payroll_reconcile_items_status_idx" ON "ai_payroll_reconcile_items"("reconcile_status");
CREATE INDEX "ai_payroll_reconcile_items_composite_idx" ON "ai_payroll_reconcile_items"("reconcile_session_id", "reconcile_employee_id", "reconcile_date");

-- 5. 修改 ai_payroll_batches：新增 session 關聯
ALTER TABLE "ai_payroll_batches" ADD COLUMN "batch_session_id" INTEGER;
CREATE INDEX "ai_payroll_batches_session_id_idx" ON "ai_payroll_batches"("batch_session_id");

-- 6. 修改 payrolls：新增 AI 標記
ALTER TABLE "payrolls" ADD COLUMN "payroll_ai_session_id" INTEGER;
ALTER TABLE "payrolls" ADD COLUMN "payroll_ai_generated" BOOLEAN DEFAULT false;
CREATE INDEX "payrolls_ai_session_id_idx" ON "payrolls"("payroll_ai_session_id");

-- 7. Foreign Keys
ALTER TABLE "ai_payroll_sessions" ADD CONSTRAINT "ai_payroll_sessions_company_id_fkey"
    FOREIGN KEY ("session_company_id") REFERENCES "companies"("id") ON DELETE RESTRICT;

ALTER TABLE "ai_payroll_questions" ADD CONSTRAINT "ai_payroll_questions_session_id_fkey"
    FOREIGN KEY ("question_session_id") REFERENCES "ai_payroll_sessions"("id") ON DELETE CASCADE;

ALTER TABLE "ai_payroll_questions" ADD CONSTRAINT "ai_payroll_questions_knowledge_entry_id_fkey"
    FOREIGN KEY ("question_knowledge_entry_id") REFERENCES "ai_knowledge_entries"("id") ON DELETE SET NULL;

ALTER TABLE "ai_payroll_source_records" ADD CONSTRAINT "ai_payroll_source_records_session_id_fkey"
    FOREIGN KEY ("source_record_session_id") REFERENCES "ai_payroll_sessions"("id") ON DELETE CASCADE;

ALTER TABLE "ai_payroll_reconcile_items" ADD CONSTRAINT "ai_payroll_reconcile_items_session_id_fkey"
    FOREIGN KEY ("reconcile_session_id") REFERENCES "ai_payroll_sessions"("id") ON DELETE CASCADE;

ALTER TABLE "ai_payroll_reconcile_items" ADD CONSTRAINT "ai_payroll_reconcile_items_work_log_id_fkey"
    FOREIGN KEY ("reconcile_work_log_id") REFERENCES "work_logs"("id") ON DELETE SET NULL;

ALTER TABLE "ai_payroll_batches" ADD CONSTRAINT "ai_payroll_batches_session_id_fkey"
    FOREIGN KEY ("batch_session_id") REFERENCES "ai_payroll_sessions"("id") ON DELETE SET NULL;

ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_ai_session_id_fkey"
    FOREIGN KEY ("payroll_ai_session_id") REFERENCES "ai_payroll_sessions"("id") ON DELETE SET NULL;
