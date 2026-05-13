-- Add owned date and notes for vehicle plates
ALTER TABLE "vehicle_plates"
  ADD COLUMN IF NOT EXISTS "plate_owned_date" DATE,
  ADD COLUMN IF NOT EXISTS "plate_notes" TEXT;

CREATE INDEX IF NOT EXISTS "vehicle_plates_plate_owned_date_idx" ON "vehicle_plates"("plate_owned_date");
