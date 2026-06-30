-- Create vehicle_plates table if not exists (may be created by later migration 20260526)
CREATE TABLE IF NOT EXISTS "vehicle_plates" (
    "id" SERIAL NOT NULL,
    "plate_number" VARCHAR(20) NOT NULL,
    "owner_company_id" INTEGER,
    "status" VARCHAR(20) NOT NULL DEFAULT 'available',
    "current_vehicle_id" INTEGER,
    "plate_owned_date" DATE,
    "plate_notes" TEXT,
    "plate_expiry_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vehicle_plates_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "vehicle_plates_plate_number_key" ON "vehicle_plates"("plate_number");
-- Add columns if table already exists but columns don't
ALTER TABLE "vehicle_plates"
  ADD COLUMN IF NOT EXISTS "plate_owned_date" DATE,
  ADD COLUMN IF NOT EXISTS "plate_notes" TEXT;
CREATE INDEX IF NOT EXISTS "vehicle_plates_plate_owned_date_idx" ON "vehicle_plates"("plate_owned_date");
