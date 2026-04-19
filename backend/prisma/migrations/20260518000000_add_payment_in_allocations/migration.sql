-- ══════════════════════════════════════════════════════════════
-- PaymentInAllocation: many-to-many allocation table between
-- PaymentIn and Invoice.
--
-- This migration also backfills existing data:
--   Each PaymentIn whose legacy source_type is 'invoice' / 'INVOICE'
--   (case-insensitive) and has a non-null source_ref_id becomes a
--   PaymentInAllocation row using PaymentIn.amount.
--
-- The legacy polymorphic columns (source_type / source_ref_id) on
-- payment_ins are kept intact for backward compatibility and for
-- other source types (IPA / payment_certificate / retention_release /
-- other) which still use the legacy mechanism.
-- ══════════════════════════════════════════════════════════════

-- CreateTable
CREATE TABLE IF NOT EXISTS "payment_in_allocations" (
    "id" SERIAL NOT NULL,
    "payment_in_allocation_payment_in_id" INTEGER NOT NULL,
    "payment_in_allocation_invoice_id" INTEGER,
    "payment_in_allocation_amount" DECIMAL(14,2) NOT NULL,
    "payment_in_allocation_remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_in_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "payment_in_allocations_payment_in_id_idx" ON "payment_in_allocations"("payment_in_allocation_payment_in_id");
CREATE INDEX IF NOT EXISTS "payment_in_allocations_invoice_id_idx" ON "payment_in_allocations"("payment_in_allocation_invoice_id");

-- AddForeignKey
ALTER TABLE "payment_in_allocations"
    ADD CONSTRAINT "payment_in_allocations_payment_in_fkey"
    FOREIGN KEY ("payment_in_allocation_payment_in_id")
    REFERENCES "payment_ins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payment_in_allocations"
    ADD CONSTRAINT "payment_in_allocations_invoice_fkey"
    FOREIGN KEY ("payment_in_allocation_invoice_id")
    REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ══════════════════════════════════════════════════════════════
-- Data migration: backfill from existing PaymentIn records whose
-- source_type is invoice (case-insensitive) and which reference a
-- valid Invoice id.  We join against invoices to guarantee the
-- foreign key is valid, since source_ref_id historically was not
-- constrained.
-- ══════════════════════════════════════════════════════════════

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
    'Auto-migrated from legacy PaymentIn.source_type=invoice',
    pi."created_at",
    pi."updated_at"
FROM "payment_ins" pi
INNER JOIN "invoices" inv ON inv."id" = pi."source_ref_id"
WHERE pi."source_ref_id" IS NOT NULL
  AND LOWER(pi."source_type") = 'invoice'
  AND NOT EXISTS (
      SELECT 1 FROM "payment_in_allocations" a
      WHERE a."payment_in_allocation_payment_in_id" = pi."id"
        AND a."payment_in_allocation_invoice_id" = pi."source_ref_id"
  );
