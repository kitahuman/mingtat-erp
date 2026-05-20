-- Add invoice revision support. Existing invoices remain original active versions.
ALTER TABLE "invoices"
  ADD COLUMN IF NOT EXISTS "invoice_parent_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "invoice_revision_number" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "invoice_is_active" BOOLEAN NOT NULL DEFAULT true;

UPDATE "invoices"
SET
  "invoice_revision_number" = COALESCE("invoice_revision_number", 0),
  "invoice_is_active" = COALESCE("invoice_is_active", true)
WHERE "invoice_revision_number" IS NULL OR "invoice_is_active" IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'invoices_invoice_parent_id_fkey'
  ) THEN
    ALTER TABLE "invoices"
      ADD CONSTRAINT "invoices_invoice_parent_id_fkey"
      FOREIGN KEY ("invoice_parent_id") REFERENCES "invoices"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "invoices_invoice_parent_id_idx" ON "invoices"("invoice_parent_id");
CREATE INDEX IF NOT EXISTS "invoices_invoice_is_active_idx" ON "invoices"("invoice_is_active");
