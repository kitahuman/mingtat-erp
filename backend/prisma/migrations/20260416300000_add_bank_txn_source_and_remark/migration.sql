-- AlterTable: Add bank_txn_source and bank_txn_remark to bank_transactions
ALTER TABLE "bank_transactions" ADD COLUMN "bank_txn_source" VARCHAR(20) NOT NULL DEFAULT 'csv';
ALTER TABLE "bank_transactions" ADD COLUMN "bank_txn_remark" TEXT;
