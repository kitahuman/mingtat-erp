-- Add billing quantity controls to the existing payroll_work_logs table.
-- No new tables or endpoints are introduced for the payroll redesign.
ALTER TABLE "payroll_work_logs"
  ADD COLUMN IF NOT EXISTS "payroll_work_log_product_quantity" DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS "billing_quantity_type" TEXT DEFAULT 'quantity';
