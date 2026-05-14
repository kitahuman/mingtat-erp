-- Create invoice-work log junction table
CREATE TABLE "invoice_work_logs" (
    "id" SERIAL NOT NULL,
    "invoice_id" INTEGER NOT NULL,
    "work_log_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_work_logs_pkey" PRIMARY KEY ("id")
);

-- Prevent duplicate links between the same invoice and work log
CREATE UNIQUE INDEX "invoice_work_logs_invoice_id_work_log_id_key" ON "invoice_work_logs"("invoice_id", "work_log_id");

-- Support lookup by work log
CREATE INDEX "invoice_work_logs_work_log_id_idx" ON "invoice_work_logs"("work_log_id");

-- Foreign keys
ALTER TABLE "invoice_work_logs" ADD CONSTRAINT "invoice_work_logs_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invoice_work_logs" ADD CONSTRAINT "invoice_work_logs_work_log_id_fkey" FOREIGN KEY ("work_log_id") REFERENCES "work_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
