-- Fix migrated invoices with invalid 'pending' status
-- Convert all invoices with status='pending' to status='draft'
UPDATE "invoices"
SET "status" = 'draft'
WHERE "status" = 'pending';
