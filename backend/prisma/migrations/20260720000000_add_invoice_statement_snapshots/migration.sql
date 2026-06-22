-- AlterTable: add display flag columns to invoice_statements
ALTER TABLE "invoice_statements"
  ADD COLUMN "statement_show_paid_columns" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "statement_show_bank_info" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "statement_show_signature" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: add snapshot columns to invoice_statement_items
ALTER TABLE "invoice_statement_items"
  ADD COLUMN "item_invoice_no" TEXT,
  ADD COLUMN "item_date" TIMESTAMP(3),
  ADD COLUMN "item_title" TEXT,
  ADD COLUMN "item_status" TEXT,
  ADD COLUMN "item_amount" DECIMAL(14,2),
  ADD COLUMN "item_paid_amount" DECIMAL(14,2),
  ADD COLUMN "item_outstanding" DECIMAL(14,2),
  ADD COLUMN "item_type" TEXT NOT NULL DEFAULT 'invoice',
  ADD COLUMN "item_remarks" TEXT;

-- Make invoice_id nullable to support custom items
ALTER TABLE "invoice_statement_items" ALTER COLUMN "invoice_id" DROP NOT NULL;

-- Drop the old unique composite index (custom items can repeat / be NULL)
DROP INDEX IF EXISTS "invoice_statement_items_statement_id_invoice_id_key";

-- Replace the foreign key: on delete set null instead of cascade
ALTER TABLE "invoice_statement_items" DROP CONSTRAINT IF EXISTS "invoice_statement_items_invoice_id_fkey";
ALTER TABLE "invoice_statement_items" ADD CONSTRAINT "invoice_statement_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add index on statement_id
CREATE INDEX IF NOT EXISTS "invoice_statement_items_statement_id_idx" ON "invoice_statement_items"("statement_id");

-- Backfill snapshot data for existing items from their source invoices
UPDATE "invoice_statement_items" AS it
SET
  "item_invoice_no" = inv."invoice_no",
  "item_date" = inv."date",
  "item_title" = inv."invoice_title",
  "item_status" = inv."status",
  "item_amount" = inv."total_amount",
  "item_paid_amount" = inv."paid_amount",
  "item_outstanding" = inv."outstanding",
  "item_type" = 'invoice'
FROM "invoices" AS inv
WHERE it."invoice_id" = inv."id";
