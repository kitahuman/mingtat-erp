-- ============================================================
-- Migration: bank_account_fk_refactor
-- 1. BankAccount 加 company_id 外鍵
-- 2. PaymentIn: bank_account (text) → bank_account_id (FK)
-- 3. PaymentOut: bank_account (text) → bank_account_id (FK)
-- ============================================================

-- Step 1: Add company_id to bank_accounts
ALTER TABLE `bank_accounts` ADD COLUMN `company_id` INT NULL;
ALTER TABLE `bank_accounts` ADD CONSTRAINT `bank_accounts_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 2: PaymentIn — add bank_account_id, migrate data, drop old column
ALTER TABLE `payment_ins` ADD COLUMN `bank_account_id` INT NULL;

-- Attempt to match existing free-text bank_account to BankAccount records
-- Match by account_no or account_name (case-insensitive)
UPDATE `payment_ins` pi
  JOIN `bank_accounts` ba ON (
    pi.`bank_account` IS NOT NULL
    AND pi.`bank_account` != ''
    AND (
      LOWER(TRIM(pi.`bank_account`)) = LOWER(TRIM(ba.`account_no`))
      OR LOWER(TRIM(pi.`bank_account`)) = LOWER(TRIM(ba.`account_name`))
      OR LOWER(TRIM(pi.`bank_account`)) = LOWER(CONCAT(ba.`bank_name`, ' - ', ba.`account_name`))
      OR LOWER(TRIM(pi.`bank_account`)) = LOWER(CONCAT(ba.`bank_name`, ' - ', ba.`account_no`))
    )
  )
SET pi.`bank_account_id` = ba.`id`;

-- Drop old text column
ALTER TABLE `payment_ins` DROP COLUMN `bank_account`;

-- Add FK constraint
ALTER TABLE `payment_ins` ADD CONSTRAINT `payment_ins_bank_account_id_fkey` FOREIGN KEY (`bank_account_id`) REFERENCES `bank_accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 3: PaymentOut — add bank_account_id, migrate data, drop old column
ALTER TABLE `payment_outs` ADD COLUMN `bank_account_id` INT NULL;

-- Attempt to match existing free-text bank_account to BankAccount records
UPDATE `payment_outs` po
  JOIN `bank_accounts` ba ON (
    po.`bank_account` IS NOT NULL
    AND po.`bank_account` != ''
    AND (
      LOWER(TRIM(po.`bank_account`)) = LOWER(TRIM(ba.`account_no`))
      OR LOWER(TRIM(po.`bank_account`)) = LOWER(TRIM(ba.`account_name`))
      OR LOWER(TRIM(po.`bank_account`)) = LOWER(CONCAT(ba.`bank_name`, ' - ', ba.`account_name`))
      OR LOWER(TRIM(po.`bank_account`)) = LOWER(CONCAT(ba.`bank_name`, ' - ', ba.`account_no`))
    )
  )
SET po.`bank_account_id` = ba.`id`;

-- Drop old text column
ALTER TABLE `payment_outs` DROP COLUMN `bank_account`;

-- Add FK constraint
ALTER TABLE `payment_outs` ADD CONSTRAINT `payment_outs_bank_account_id_fkey` FOREIGN KEY (`bank_account_id`) REFERENCES `bank_accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
