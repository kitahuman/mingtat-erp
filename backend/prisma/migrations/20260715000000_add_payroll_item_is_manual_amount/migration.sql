-- Add payroll_item_is_manual_amount column to payroll_items table
ALTER TABLE "payroll_items" ADD COLUMN "payroll_item_is_manual_amount" BOOLEAN NOT NULL DEFAULT false;
