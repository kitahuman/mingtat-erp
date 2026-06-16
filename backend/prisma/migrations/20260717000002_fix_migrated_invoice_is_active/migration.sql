-- Fix migrated invoices that have invoice_is_active = NULL or false
-- These invoices were imported before the invoice_is_active column was added,
-- or were inserted directly via SQL without setting this field.
-- This causes them to be filtered out by the invoice list query (invoice_is_active = true).
UPDATE "invoices"
SET "invoice_is_active" = true
WHERE "invoice_is_active" IS NULL OR "invoice_is_active" = false;
