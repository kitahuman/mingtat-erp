-- Fix migrated invoices that were incorrectly set to 'draft' (from previous fix)
-- Convert invoices with status='draft' and remarks containing 'batch' to 'issued'
UPDATE "invoices"
SET "status" = 'issued'
WHERE "status" = 'draft'
  AND "remarks" LIKE '%batch%';
