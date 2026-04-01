-- Add cert_photos JSON field to employees table for storing certificate photo URLs
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "cert_photos" JSONB;
