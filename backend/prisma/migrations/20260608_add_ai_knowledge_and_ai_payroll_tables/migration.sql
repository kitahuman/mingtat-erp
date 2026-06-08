-- CreateTable
CREATE TABLE "ai_knowledge_entries" (
    "id" SERIAL NOT NULL,
    "knowledge_module_scope" VARCHAR(20) NOT NULL,
    "knowledge_module_code" VARCHAR(50),
    "knowledge_category" VARCHAR(50) NOT NULL,
    "knowledge_title" VARCHAR(255) NOT NULL,
    "knowledge_description" TEXT NOT NULL,
    "knowledge_payload_json" JSONB NOT NULL,
    "knowledge_applies_to_entity_type" VARCHAR(50),
    "knowledge_applies_to_entity_id" INTEGER,
    "knowledge_keywords" JSONB,
    "knowledge_confidence_score" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "knowledge_support_count" INTEGER NOT NULL DEFAULT 0,
    "knowledge_contradiction_count" INTEGER NOT NULL DEFAULT 0,
    "knowledge_usage_count" INTEGER NOT NULL DEFAULT 0,
    "knowledge_last_used_at" TIMESTAMP(3),
    "knowledge_status" VARCHAR(30) NOT NULL DEFAULT 'candidate',
    "knowledge_effective_from" DATE,
    "knowledge_effective_to" DATE,
    "knowledge_created_by_type" VARCHAR(20) NOT NULL,
    "knowledge_created_by" INTEGER,
    "knowledge_approved_by" INTEGER,
    "knowledge_approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_knowledge_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_knowledge_evidence" (
    "id" SERIAL NOT NULL,
    "evidence_knowledge_entry_id" INTEGER NOT NULL,
    "evidence_source_module_code" VARCHAR(50) NOT NULL,
    "evidence_source_entity_type" VARCHAR(80) NOT NULL,
    "evidence_source_entity_id" INTEGER NOT NULL,
    "evidence_before_value" TEXT,
    "evidence_after_value" TEXT,
    "evidence_summary" TEXT NOT NULL,
    "evidence_weight" DECIMAL(5,2) NOT NULL DEFAULT 1,
    "evidence_confirmed_by" INTEGER,
    "evidence_confirmed_at" TIMESTAMP(3),
    "evidence_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_knowledge_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_knowledge_versions" (
    "id" SERIAL NOT NULL,
    "version_knowledge_entry_id" INTEGER NOT NULL,
    "version_number" INTEGER NOT NULL,
    "version_payload_json" JSONB NOT NULL,
    "version_change_summary" TEXT,
    "version_edited_by" INTEGER,
    "version_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_knowledge_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_knowledge_reviews" (
    "id" SERIAL NOT NULL,
    "review_knowledge_entry_id" INTEGER NOT NULL,
    "review_action" VARCHAR(30) NOT NULL,
    "review_reason" TEXT,
    "review_user_id" INTEGER NOT NULL,
    "review_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_knowledge_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_knowledge_usage_logs" (
    "id" SERIAL NOT NULL,
    "usage_knowledge_entry_id" INTEGER NOT NULL,
    "usage_task_module_code" VARCHAR(50) NOT NULL,
    "usage_task_type" VARCHAR(80) NOT NULL,
    "usage_task_entity_id" INTEGER,
    "usage_retrieval_score" DECIMAL(8,4),
    "usage_injected_to_prompt" BOOLEAN NOT NULL DEFAULT false,
    "usage_applied_by_rule_engine" BOOLEAN NOT NULL DEFAULT false,
    "usage_outcome" VARCHAR(30),
    "usage_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_knowledge_usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_knowledge_embeddings" (
    "id" SERIAL NOT NULL,
    "embedding_knowledge_entry_id" INTEGER NOT NULL,
    "embedding_model" VARCHAR(50) NOT NULL,
    "embedding_vector_json" JSONB,
    "embedding_external_id" VARCHAR(255),
    "embedding_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_knowledge_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_knowledge_module_policies" (
    "id" SERIAL NOT NULL,
    "policy_module_code" VARCHAR(50) NOT NULL,
    "policy_allowed_categories" JSONB NOT NULL,
    "policy_max_entries_per_task" INTEGER NOT NULL DEFAULT 20,
    "policy_max_prompt_characters" INTEGER NOT NULL DEFAULT 4000,
    "policy_auto_candidate_enabled" BOOLEAN NOT NULL DEFAULT true,
    "policy_review_threshold" INTEGER NOT NULL DEFAULT 3,
    "policy_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "policy_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_knowledge_module_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_payroll_batches" (
    "id" SERIAL NOT NULL,
    "batch_payroll_month" VARCHAR(7) NOT NULL,
    "batch_period" VARCHAR(20),
    "batch_form_type_default" VARCHAR(30) NOT NULL DEFAULT 'auto',
    "batch_status" VARCHAR(30) NOT NULL DEFAULT 'draft',
    "batch_notes" TEXT,
    "batch_created_by" INTEGER NOT NULL,
    "batch_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "batch_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_payroll_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_payroll_documents" (
    "id" SERIAL NOT NULL,
    "doc_batch_id" INTEGER NOT NULL,
    "doc_original_filename" VARCHAR(500) NOT NULL,
    "doc_storage_path" VARCHAR(1000) NOT NULL,
    "doc_mime_type" VARCHAR(100) NOT NULL,
    "doc_file_size" INTEGER NOT NULL,
    "doc_page_count" INTEGER DEFAULT 1,
    "doc_quality_score" DECIMAL(5,2),
    "doc_quality_issues" JSONB,
    "doc_status" VARCHAR(30) NOT NULL DEFAULT 'uploaded',
    "doc_uploaded_by" INTEGER NOT NULL,
    "doc_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_payroll_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_payroll_pages" (
    "id" SERIAL NOT NULL,
    "page_document_id" INTEGER NOT NULL,
    "page_number" INTEGER NOT NULL DEFAULT 1,
    "page_image_path" VARCHAR(1000) NOT NULL,
    "page_form_type" VARCHAR(30),
    "page_form_type_confidence" DECIMAL(5,2),
    "page_employee_name_hint" VARCHAR(100),
    "page_employee_id" INTEGER,
    "page_status" VARCHAR(30) NOT NULL DEFAULT 'pending',
    "page_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_payroll_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_payroll_extraction_runs" (
    "id" SERIAL NOT NULL,
    "run_page_id" INTEGER NOT NULL,
    "run_model_name" VARCHAR(50) NOT NULL,
    "run_prompt_version" VARCHAR(50) NOT NULL,
    "run_schema_version" VARCHAR(50) NOT NULL,
    "run_input_image_hash" VARCHAR(64),
    "run_raw_response" JSONB NOT NULL,
    "run_token_usage" JSONB,
    "run_duration_ms" INTEGER,
    "run_status" VARCHAR(30) NOT NULL DEFAULT 'pending',
    "run_error_message" TEXT,
    "run_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_payroll_extraction_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_payroll_entries" (
    "id" SERIAL NOT NULL,
    "entry_page_id" INTEGER NOT NULL,
    "entry_run_id" INTEGER NOT NULL,
    "entry_row_number" INTEGER,
    "entry_work_date" DATE,
    "entry_employee_id" INTEGER,
    "entry_employee_name_raw" VARCHAR(100),
    "entry_form_type" VARCHAR(30) NOT NULL,
    "entry_status" VARCHAR(30) NOT NULL DEFAULT 'extracted',
    "entry_overall_confidence" DECIMAL(5,2),
    "entry_flags" JSONB,
    "entry_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entry_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_payroll_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_payroll_entry_fields" (
    "id" SERIAL NOT NULL,
    "field_entry_id" INTEGER NOT NULL,
    "field_name" VARCHAR(50) NOT NULL,
    "field_raw_text" TEXT,
    "field_normalized_value" TEXT,
    "field_confidence" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "field_bbox_json" JSONB,
    "field_flags" JSONB,
    "field_is_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "field_confirmed_value" TEXT,
    "field_confirmed_by" INTEGER,
    "field_confirmed_at" TIMESTAMP(3),
    "field_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_payroll_entry_fields_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_knowledge_entries_knowledge_module_code_idx" ON "ai_knowledge_entries"("knowledge_module_code");

-- CreateIndex
CREATE INDEX "ai_knowledge_entries_knowledge_category_idx" ON "ai_knowledge_entries"("knowledge_category");

-- CreateIndex
CREATE INDEX "ai_knowledge_entries_knowledge_status_idx" ON "ai_knowledge_entries"("knowledge_status");

-- CreateIndex
CREATE INDEX "ai_knowledge_entries_knowledge_applies_to_entity_type_knowledge_applies_to_entity_id_idx" ON "ai_knowledge_entries"("knowledge_applies_to_entity_type", "knowledge_applies_to_entity_id");

-- CreateIndex
CREATE INDEX "ai_knowledge_evidence_evidence_knowledge_entry_id_idx" ON "ai_knowledge_evidence"("evidence_knowledge_entry_id");

-- CreateIndex
CREATE INDEX "ai_knowledge_evidence_evidence_source_module_code_idx" ON "ai_knowledge_evidence"("evidence_source_module_code");

-- CreateIndex
CREATE INDEX "ai_knowledge_versions_version_knowledge_entry_id_idx" ON "ai_knowledge_versions"("version_knowledge_entry_id");

-- CreateIndex
CREATE INDEX "ai_knowledge_reviews_review_knowledge_entry_id_idx" ON "ai_knowledge_reviews"("review_knowledge_entry_id");

-- CreateIndex
CREATE INDEX "ai_knowledge_usage_logs_usage_knowledge_entry_id_idx" ON "ai_knowledge_usage_logs"("usage_knowledge_entry_id");

-- CreateIndex
CREATE INDEX "ai_knowledge_usage_logs_usage_task_module_code_idx" ON "ai_knowledge_usage_logs"("usage_task_module_code");

-- CreateIndex
CREATE INDEX "ai_knowledge_usage_logs_usage_used_at_idx" ON "ai_knowledge_usage_logs"("usage_used_at");

-- CreateIndex
CREATE UNIQUE INDEX "ai_knowledge_embeddings_embedding_knowledge_entry_id_key" ON "ai_knowledge_embeddings"("embedding_knowledge_entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_knowledge_module_policies_policy_module_code_key" ON "ai_knowledge_module_policies"("policy_module_code");

-- CreateIndex
CREATE INDEX "ai_payroll_batches_batch_payroll_month_idx" ON "ai_payroll_batches"("batch_payroll_month");

-- CreateIndex
CREATE INDEX "ai_payroll_batches_batch_status_idx" ON "ai_payroll_batches"("batch_status");

-- CreateIndex
CREATE INDEX "ai_payroll_documents_doc_batch_id_idx" ON "ai_payroll_documents"("doc_batch_id");

-- CreateIndex
CREATE INDEX "ai_payroll_pages_page_document_id_idx" ON "ai_payroll_pages"("page_document_id");

-- CreateIndex
CREATE INDEX "ai_payroll_pages_page_employee_id_idx" ON "ai_payroll_pages"("page_employee_id");

-- CreateIndex
CREATE INDEX "ai_payroll_extraction_runs_run_page_id_idx" ON "ai_payroll_extraction_runs"("run_page_id");

-- CreateIndex
CREATE INDEX "ai_payroll_entries_entry_page_id_idx" ON "ai_payroll_entries"("entry_page_id");

-- CreateIndex
CREATE INDEX "ai_payroll_entries_entry_run_id_idx" ON "ai_payroll_entries"("entry_run_id");

-- CreateIndex
CREATE INDEX "ai_payroll_entries_entry_employee_id_idx" ON "ai_payroll_entries"("entry_employee_id");

-- CreateIndex
CREATE INDEX "ai_payroll_entries_entry_work_date_idx" ON "ai_payroll_entries"("entry_work_date");

-- CreateIndex
CREATE INDEX "ai_payroll_entry_fields_field_entry_id_idx" ON "ai_payroll_entry_fields"("field_entry_id");

-- CreateIndex
CREATE INDEX "ai_payroll_entry_fields_field_name_idx" ON "ai_payroll_entry_fields"("field_name");

-- AddForeignKey
ALTER TABLE "ai_knowledge_evidence" ADD CONSTRAINT "ai_knowledge_evidence_evidence_knowledge_entry_id_fkey" FOREIGN KEY ("evidence_knowledge_entry_id") REFERENCES "ai_knowledge_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_knowledge_versions" ADD CONSTRAINT "ai_knowledge_versions_version_knowledge_entry_id_fkey" FOREIGN KEY ("version_knowledge_entry_id") REFERENCES "ai_knowledge_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_knowledge_reviews" ADD CONSTRAINT "ai_knowledge_reviews_review_knowledge_entry_id_fkey" FOREIGN KEY ("review_knowledge_entry_id") REFERENCES "ai_knowledge_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_knowledge_usage_logs" ADD CONSTRAINT "ai_knowledge_usage_logs_usage_knowledge_entry_id_fkey" FOREIGN KEY ("usage_knowledge_entry_id") REFERENCES "ai_knowledge_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_knowledge_embeddings" ADD CONSTRAINT "ai_knowledge_embeddings_embedding_knowledge_entry_id_fkey" FOREIGN KEY ("embedding_knowledge_entry_id") REFERENCES "ai_knowledge_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_payroll_documents" ADD CONSTRAINT "ai_payroll_documents_doc_batch_id_fkey" FOREIGN KEY ("doc_batch_id") REFERENCES "ai_payroll_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_payroll_pages" ADD CONSTRAINT "ai_payroll_pages_page_document_id_fkey" FOREIGN KEY ("page_document_id") REFERENCES "ai_payroll_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_payroll_extraction_runs" ADD CONSTRAINT "ai_payroll_extraction_runs_run_page_id_fkey" FOREIGN KEY ("run_page_id") REFERENCES "ai_payroll_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_payroll_entries" ADD CONSTRAINT "ai_payroll_entries_entry_page_id_fkey" FOREIGN KEY ("entry_page_id") REFERENCES "ai_payroll_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_payroll_entries" ADD CONSTRAINT "ai_payroll_entries_entry_run_id_fkey" FOREIGN KEY ("entry_run_id") REFERENCES "ai_payroll_extraction_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_payroll_entry_fields" ADD CONSTRAINT "ai_payroll_entry_fields_field_entry_id_fkey" FOREIGN KEY ("field_entry_id") REFERENCES "ai_payroll_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
