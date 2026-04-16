-- AlterTable: Add expense_payment_method to expenses
ALTER TABLE "expenses" ADD COLUMN "expense_payment_method" VARCHAR(20) NOT NULL DEFAULT 'SELF_PAID';
