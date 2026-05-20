-- Add receipt/document number field for expenses
ALTER TABLE "expenses" ADD COLUMN "expense_receipt_number" TEXT;
