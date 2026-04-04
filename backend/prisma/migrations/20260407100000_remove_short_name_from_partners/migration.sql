-- Migrate short_name data to code: only copy where code is NULL or empty
UPDATE "partners"
SET "code" = "short_name"
WHERE ("code" IS NULL OR "code" = '')
  AND "short_name" IS NOT NULL
  AND "short_name" != '';

-- Drop short_name column from partners table
ALTER TABLE "partners" DROP COLUMN IF EXISTS "short_name";
