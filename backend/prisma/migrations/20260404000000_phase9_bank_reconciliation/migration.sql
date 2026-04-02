-- Phase 9: Bank Reconciliation

-- BankAccount (銀行帳戶)
CREATE TABLE "bank_accounts" (
    "id" SERIAL NOT NULL,
    "account_name" VARCHAR(200) NOT NULL,
    "bank_name" VARCHAR(200) NOT NULL,
    "account_no" VARCHAR(100) NOT NULL,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'HKD',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- BankTransaction (銀行交易記錄)
CREATE TABLE "bank_transactions" (
    "id" SERIAL NOT NULL,
    "bank_account_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "debit_credit" VARCHAR(10) NOT NULL,
    "balance" DECIMAL(14,2),
    "reference_no" VARCHAR(200),
    "match_status" VARCHAR(20) NOT NULL DEFAULT 'unmatched',
    "matched_type" VARCHAR(30),
    "matched_id" INTEGER,
    "import_batch" VARCHAR(100),
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "bank_transactions_bank_account_id_date_idx" ON "bank_transactions"("bank_account_id", "date");
CREATE INDEX "bank_transactions_match_status_idx" ON "bank_transactions"("match_status");

-- Foreign Keys
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
