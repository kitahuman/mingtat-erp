-- Add expense creator (publisher) tracking
ALTER TABLE "expenses" ADD COLUMN "created_by" INTEGER;

CREATE INDEX "expenses_created_by_idx" ON "expenses"("created_by");

ALTER TABLE "expenses"
ADD CONSTRAINT "expenses_created_by_fkey"
FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
