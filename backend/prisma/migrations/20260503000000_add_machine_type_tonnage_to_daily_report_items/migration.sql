-- Add machine_type and tonnage fields to daily_report_items
ALTER TABLE "daily_report_items" ADD COLUMN IF NOT EXISTS "daily_report_item_machine_type" VARCHAR(100);
ALTER TABLE "daily_report_items" ADD COLUMN IF NOT EXISTS "daily_report_item_tonnage" DECIMAL(5,1);
