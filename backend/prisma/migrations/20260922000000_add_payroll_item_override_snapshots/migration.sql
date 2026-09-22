-- Independent overlay snapshot fields for 基本薪金 / 工作收入 / 底薪.
-- Existing payroll rows are not rewritten; new columns default to NULL.

ALTER TABLE "payroll_items"
  ADD COLUMN "payroll_item_system_amount" DECIMAL(12, 2),
  ADD COLUMN "payroll_item_system_quantity" DECIMAL(10, 2),
  ADD COLUMN "payroll_item_system_remarks" TEXT,
  ADD COLUMN "payroll_item_manual_amount" DECIMAL(12, 2),
  ADD COLUMN "payroll_item_manual_remarks" TEXT;
