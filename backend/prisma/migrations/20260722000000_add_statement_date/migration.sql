-- AlterTable: add statement_date column to invoice_statements
ALTER TABLE "invoice_statements"
  ADD COLUMN "statement_date" TIMESTAMP(3);

-- Create index on statement_date for better query performance
CREATE INDEX IF NOT EXISTS "invoice_statements_statement_date_idx" ON "invoice_statements"("statement_date");
