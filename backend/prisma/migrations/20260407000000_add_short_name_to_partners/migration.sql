-- Add short_name column to partners table
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "short_name" TEXT;
