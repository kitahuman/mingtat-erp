-- Add quotation revision version fields with safe defaults for existing data
ALTER TABLE "quotations"
  ADD COLUMN "quotation_parent_id" INTEGER,
  ADD COLUMN "quotation_revision_number" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "quotation_is_active" BOOLEAN NOT NULL DEFAULT true;

-- Explicitly normalize existing rows as original active quotations.
UPDATE "quotations"
SET
  "quotation_parent_id" = NULL,
  "quotation_revision_number" = 0,
  "quotation_is_active" = true
WHERE "quotation_revision_number" IS NULL
   OR "quotation_is_active" IS NULL
   OR "quotation_parent_id" IS NOT NULL;

ALTER TABLE "quotations"
  ADD CONSTRAINT "quotations_quotation_parent_id_fkey"
  FOREIGN KEY ("quotation_parent_id") REFERENCES "quotations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "quotations_quotation_parent_id_idx" ON "quotations"("quotation_parent_id");
CREATE INDEX "quotations_quotation_is_active_idx" ON "quotations"("quotation_is_active");
CREATE INDEX "quotations_quotation_revision_number_idx" ON "quotations"("quotation_revision_number");
