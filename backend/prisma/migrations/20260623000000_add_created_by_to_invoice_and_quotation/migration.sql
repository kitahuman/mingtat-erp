-- Add creator tracking to invoices and quotations
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "created_by" INTEGER;
ALTER TABLE "quotations" ADD COLUMN IF NOT EXISTS "created_by" INTEGER;

CREATE INDEX IF NOT EXISTS "invoices_created_by_idx" ON "invoices"("created_by");
CREATE INDEX IF NOT EXISTS "quotations_created_by_idx" ON "quotations"("created_by");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_created_by_fkey') THEN
    ALTER TABLE "invoices"
    ADD CONSTRAINT "invoices_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quotations_created_by_fkey') THEN
    ALTER TABLE "quotations"
    ADD CONSTRAINT "quotations_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
