-- AlterTable: Add new columns
ALTER TABLE "payment_outs" ADD COLUMN IF NOT EXISTS "payment_out_description" VARCHAR(255);
ALTER TABLE "payment_outs" ADD COLUMN IF NOT EXISTS "payment_out_status" VARCHAR(20) NOT NULL DEFAULT 'unpaid';

-- Migrate existing remarks that look like payroll descriptions into payment_out_description
UPDATE "payment_outs"
SET "payment_out_description" = "remarks"
WHERE "remarks" IS NOT NULL
  AND ("remarks" LIKE '%的糧單%' OR "remarks" LIKE '%糧單]%');

-- Drop project_id foreign key and column safely
ALTER TABLE "payment_outs" DROP CONSTRAINT IF EXISTS "payment_outs_project_id_fkey";
ALTER TABLE "payment_outs" DROP COLUMN IF EXISTS "project_id";
