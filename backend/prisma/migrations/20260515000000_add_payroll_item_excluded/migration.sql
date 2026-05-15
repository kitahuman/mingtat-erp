ALTER TABLE "payroll_items" ADD COLUMN IF NOT EXISTS "payroll_item_excluded" BOOLEAN NOT NULL DEFAULT false;
