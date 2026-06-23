-- Backfill PaymentInAllocation for legacy PaymentIn records
-- that have source_type='invoice' or 'INVOICE' and source_ref_id set
-- but no corresponding allocation record.

INSERT INTO "payment_in_allocations" (
  "payment_in_allocation_payment_in_id",
  "payment_in_allocation_invoice_id",
  "payment_in_allocation_amount",
  "payment_in_allocation_remarks",
  "created_at",
  "updated_at"
)
SELECT
  pi."id",
  pi."source_ref_id",
  pi."amount",
  pi."remarks",
  pi."created_at",
  NOW()
FROM "payment_ins" pi
WHERE LOWER(pi."source_type") = 'invoice'
  AND pi."source_ref_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "payment_in_allocations" pia
    WHERE pia."payment_in_allocation_payment_in_id" = pi."id"
      AND pia."payment_in_allocation_invoice_id" = pi."source_ref_id"
  );

-- Also normalize source_type to lowercase for all existing records
UPDATE "payment_ins"
SET "source_type" = LOWER("source_type")
WHERE "source_type" IS NOT NULL AND "source_type" != LOWER("source_type");
