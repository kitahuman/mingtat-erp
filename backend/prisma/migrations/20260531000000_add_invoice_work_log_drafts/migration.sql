-- Create invoice work-log draft table for invoice preparation window
CREATE TABLE "invoice_work_log_drafts" (
    "id" SERIAL NOT NULL,
    "invoice_id" INTEGER NOT NULL,
    "work_log_id" INTEGER NOT NULL,
    "draft_data" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_work_log_drafts_pkey" PRIMARY KEY ("id")
);

-- Keep only one latest draft per invoice/work-log pair
CREATE UNIQUE INDEX "invoice_work_log_drafts_invoice_id_work_log_id_key" ON "invoice_work_log_drafts"("invoice_id", "work_log_id");

-- Support lookup by work log
CREATE INDEX "invoice_work_log_drafts_work_log_id_idx" ON "invoice_work_log_drafts"("work_log_id");

-- Foreign keys
ALTER TABLE "invoice_work_log_drafts" ADD CONSTRAINT "invoice_work_log_drafts_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invoice_work_log_drafts" ADD CONSTRAINT "invoice_work_log_drafts_work_log_id_fkey" FOREIGN KEY ("work_log_id") REFERENCES "work_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
