-- ============================================================
-- Migration: bank_account_fk_refactor
-- 1. BankAccount 加 company_id 外鍵
-- 2. PaymentIn: bank_account (text) → bank_account_id (FK)
-- 3. PaymentOut: bank_account (text) → bank_account_id (FK)
-- ============================================================

-- Step 1: Add company_id to bank_accounts
ALTER TABLE "bank_accounts" ADD COLUMN IF NOT EXISTS "company_id" INTEGER;
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 2: PaymentIn — add bank_account_id, migrate data, drop old column
ALTER TABLE "payment_ins" ADD COLUMN IF NOT EXISTS "bank_account_id" INTEGER;

-- Attempt to match existing free-text bank_account to BankAccount records
-- PostgreSQL UPDATE ... FROM syntax
UPDATE "payment_ins" pi
SET "bank_account_id" = ba."id"
FROM "bank_accounts" ba
WHERE pi."bank_account" IS NOT NULL
  AND pi."bank_account" != ''
  AND (
    LOWER(TRIM(pi."bank_account")) = LOWER(TRIM(ba."account_no"))
    OR LOWER(TRIM(pi."bank_account")) = LOWER(TRIM(ba."account_name"))
    OR LOWER(TRIM(pi."bank_account")) = LOWER(TRIM(ba."bank_name") || ' - ' || TRIM(ba."account_name"))
    OR LOWER(TRIM(pi."bank_account")) = LOWER(TRIM(ba."bank_name") || ' - ' || TRIM(ba."account_no"))
  );

-- Drop old text column (keep it if it exists, ignore if already dropped)
ALTER TABLE "payment_ins" DROP COLUMN IF EXISTS "bank_account";

-- Add FK constraint
ALTER TABLE "payment_ins" ADD CONSTRAINT "payment_ins_bank_account_id_fkey"
  FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 3: PaymentOut — add bank_account_id, migrate data, drop old column
ALTER TABLE "payment_outs" ADD COLUMN IF NOT EXISTS "bank_account_id" INTEGER;

-- Attempt to match existing free-text bank_account to BankAccount records
UPDATE "payment_outs" po
SET "bank_account_id" = ba."id"
FROM "bank_accounts" ba
WHERE po."bank_account" IS NOT NULL
  AND po."bank_account" != ''
  AND (
    LOWER(TRIM(po."bank_account")) = LOWER(TRIM(ba."account_no"))
    OR LOWER(TRIM(po."bank_account")) = LOWER(TRIM(ba."account_name"))
    OR LOWER(TRIM(po."bank_account")) = LOWER(TRIM(ba."bank_name") || ' - ' || TRIM(ba."account_name"))
    OR LOWER(TRIM(po."bank_account")) = LOWER(TRIM(ba."bank_name") || ' - ' || TRIM(ba."account_no"))
  );

-- Drop old text column
ALTER TABLE "payment_outs" DROP COLUMN IF EXISTS "bank_account";

-- Add FK constraint
ALTER TABLE "payment_outs" ADD CONSTRAINT "payment_outs_bank_account_id_fkey"
  FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
