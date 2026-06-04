-- Add creator tracking to invoices and quotations
ALTER TABLE "invoices" ADD COLUMN "created_by" INTEGER;
ALTER TABLE "quotations" ADD COLUMN "created_by" INTEGER;

CREATE INDEX "invoices_created_by_idx" ON "invoices"("created_by");
CREATE INDEX "quotations_created_by_idx" ON "quotations"("created_by");

ALTER TABLE "invoices"
ADD CONSTRAINT "invoices_created_by_fkey"
FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "quotations"
ADD CONSTRAINT "quotations_created_by_fkey"
FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
