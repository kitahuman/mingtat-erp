-- Fix migrated invoices with invalid 'pending' status
-- Convert all invoices with status='pending' to status='issued'
UPDATE "invoices"
SET "status" = 'issued'
WHERE "status" = 'pending';
