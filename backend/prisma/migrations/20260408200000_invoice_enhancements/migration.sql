-- Invoice enhancements: invoice_title, retention fields, other_charges, item_name

-- Add invoice_title to invoices
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "invoice_title" TEXT;

-- Add retention fields to invoices
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "retention_rate" DECIMAL(5,2) NOT NULL DEFAULT 0;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "retention_amount" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- Add other_charges (JSON array of {name, amount}) to invoices
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "other_charges" JSONB;

-- Add item_name to invoice_items (like quotation_items.item_name)
ALTER TABLE "invoice_items" ADD COLUMN IF NOT EXISTS "item_name" TEXT;

-- Add client_contract_no to invoices
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "client_contract_no" TEXT;
