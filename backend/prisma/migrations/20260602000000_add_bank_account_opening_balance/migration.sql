-- Add B/F BALANCE opening balance support for bank accounts.
ALTER TABLE "bank_accounts"
  ADD COLUMN IF NOT EXISTS "opening_balance" DECIMAL(15, 2);
