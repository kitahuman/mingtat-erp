-- Migration: Payment Status Expansion + System Settings
-- Adds:
-- 1. system_settings table (for configurable settings like bank reconciliation date tolerance)
-- 2. payment_in_status column to payment_ins
-- 3. payment_status column to expenses (alongside existing is_paid for backward compat)
-- 4. PaymentOut payment_out_status already supports new values (no schema change needed, just VARCHAR)

-- ─────────────────────────────────────────────────────────────
-- 1. Create system_settings table
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "system_settings" (
  "id"          SERIAL PRIMARY KEY,
  "key"         VARCHAR(100) NOT NULL UNIQUE,
  "value"       TEXT NOT NULL,
  "description" VARCHAR(255),
  "updated_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Seed default settings
INSERT INTO "system_settings" ("key", "value", "description")
VALUES
  ('bank_reconciliation_date_tolerance', '3', '銀行對帳自動配對的日期容差（天數），預設 ±3 天')
ON CONFLICT ("key") DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 2. Add payment_in_status to payment_ins
-- ─────────────────────────────────────────────────────────────
ALTER TABLE "payment_ins"
  ADD COLUMN IF NOT EXISTS "payment_in_status" VARCHAR(20) NOT NULL DEFAULT 'unpaid';

-- ─────────────────────────────────────────────────────────────
-- 3. Add payment_status to expenses
-- ─────────────────────────────────────────────────────────────
ALTER TABLE "expenses"
  ADD COLUMN IF NOT EXISTS "payment_status" VARCHAR(20) NOT NULL DEFAULT 'unpaid';

-- Sync payment_status from existing is_paid boolean
UPDATE "expenses"
SET "payment_status" = CASE
  WHEN "is_paid" = TRUE THEN 'paid'
  ELSE 'unpaid'
END;
