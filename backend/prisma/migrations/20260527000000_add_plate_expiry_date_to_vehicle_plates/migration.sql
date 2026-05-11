-- Add expiry date for vehicle plates
ALTER TABLE "vehicle_plates"
  ADD COLUMN IF NOT EXISTS "plate_expiry_date" DATE;

CREATE INDEX IF NOT EXISTS "vehicle_plates_plate_expiry_date_idx" ON "vehicle_plates"("plate_expiry_date");
