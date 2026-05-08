-- Vehicle plate management and vehicle scrapping support

-- 1. Extend vehicles
ALTER TABLE "vehicles"
  ADD COLUMN IF NOT EXISTS "scrapped_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "scrapped_by" INTEGER,
  ADD COLUMN IF NOT EXISTS "current_plate_id" INTEGER;

-- 2. Create vehicle plates
CREATE TABLE IF NOT EXISTS "vehicle_plates" (
  "id" SERIAL PRIMARY KEY,
  "plate_number" TEXT NOT NULL,
  "owner_company_id" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'idle',
  "current_vehicle_id" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Create vehicle plate transfer history
CREATE TABLE IF NOT EXISTS "vehicle_plate_transfers" (
  "id" SERIAL PRIMARY KEY,
  "plate_id" INTEGER NOT NULL,
  "from_company_id" INTEGER NOT NULL,
  "to_company_id" INTEGER NOT NULL,
  "transfer_date" DATE NOT NULL,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Create vehicle plate assignment history
CREATE TABLE IF NOT EXISTS "vehicle_plate_assignments" (
  "id" SERIAL PRIMARY KEY,
  "plate_id" INTEGER NOT NULL,
  "vehicle_id" INTEGER NOT NULL,
  "assigned_date" DATE NOT NULL,
  "removed_date" DATE,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4b. Create generic vehicle history events
CREATE TABLE IF NOT EXISTS "vehicle_history_events" (
  "id" SERIAL PRIMARY KEY,
  "vehicle_id" INTEGER NOT NULL,
  "event_date" DATE NOT NULL,
  "event_type" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. Indexes and uniqueness constraints
CREATE UNIQUE INDEX IF NOT EXISTS "vehicle_plates_plate_number_key" ON "vehicle_plates"("plate_number");
CREATE UNIQUE INDEX IF NOT EXISTS "vehicle_plates_current_vehicle_id_key" ON "vehicle_plates"("current_vehicle_id");
CREATE INDEX IF NOT EXISTS "vehicle_plates_owner_company_id_idx" ON "vehicle_plates"("owner_company_id");
CREATE INDEX IF NOT EXISTS "vehicle_plates_status_idx" ON "vehicle_plates"("status");

CREATE INDEX IF NOT EXISTS "vehicle_plate_transfers_plate_id_idx" ON "vehicle_plate_transfers"("plate_id");
CREATE INDEX IF NOT EXISTS "vehicle_plate_transfers_from_company_id_idx" ON "vehicle_plate_transfers"("from_company_id");
CREATE INDEX IF NOT EXISTS "vehicle_plate_transfers_to_company_id_idx" ON "vehicle_plate_transfers"("to_company_id");
CREATE INDEX IF NOT EXISTS "vehicle_plate_transfers_transfer_date_idx" ON "vehicle_plate_transfers"("transfer_date");

CREATE INDEX IF NOT EXISTS "vehicle_plate_assignments_plate_id_idx" ON "vehicle_plate_assignments"("plate_id");
CREATE INDEX IF NOT EXISTS "vehicle_plate_assignments_vehicle_id_idx" ON "vehicle_plate_assignments"("vehicle_id");
CREATE INDEX IF NOT EXISTS "vehicle_plate_assignments_assigned_date_idx" ON "vehicle_plate_assignments"("assigned_date");
CREATE INDEX IF NOT EXISTS "vehicle_plate_assignments_removed_date_idx" ON "vehicle_plate_assignments"("removed_date");

CREATE UNIQUE INDEX IF NOT EXISTS "vehicles_current_plate_id_key" ON "vehicles"("current_plate_id");
CREATE INDEX IF NOT EXISTS "vehicle_history_events_vehicle_id_idx" ON "vehicle_history_events"("vehicle_id");
CREATE INDEX IF NOT EXISTS "vehicle_history_events_event_date_idx" ON "vehicle_history_events"("event_date");

-- 6. Foreign keys
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicles_scrapped_by_fkey') THEN
    ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_scrapped_by_fkey" FOREIGN KEY ("scrapped_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicles_current_plate_id_fkey') THEN
    ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_current_plate_id_fkey" FOREIGN KEY ("current_plate_id") REFERENCES "vehicle_plates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicle_plates_owner_company_id_fkey') THEN
    ALTER TABLE "vehicle_plates" ADD CONSTRAINT "vehicle_plates_owner_company_id_fkey" FOREIGN KEY ("owner_company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicle_plates_current_vehicle_id_fkey') THEN
    ALTER TABLE "vehicle_plates" ADD CONSTRAINT "vehicle_plates_current_vehicle_id_fkey" FOREIGN KEY ("current_vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicle_plate_transfers_plate_id_fkey') THEN
    ALTER TABLE "vehicle_plate_transfers" ADD CONSTRAINT "vehicle_plate_transfers_plate_id_fkey" FOREIGN KEY ("plate_id") REFERENCES "vehicle_plates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicle_plate_transfers_from_company_id_fkey') THEN
    ALTER TABLE "vehicle_plate_transfers" ADD CONSTRAINT "vehicle_plate_transfers_from_company_id_fkey" FOREIGN KEY ("from_company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicle_plate_transfers_to_company_id_fkey') THEN
    ALTER TABLE "vehicle_plate_transfers" ADD CONSTRAINT "vehicle_plate_transfers_to_company_id_fkey" FOREIGN KEY ("to_company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicle_plate_assignments_plate_id_fkey') THEN
    ALTER TABLE "vehicle_plate_assignments" ADD CONSTRAINT "vehicle_plate_assignments_plate_id_fkey" FOREIGN KEY ("plate_id") REFERENCES "vehicle_plates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicle_plate_assignments_vehicle_id_fkey') THEN
    ALTER TABLE "vehicle_plate_assignments" ADD CONSTRAINT "vehicle_plate_assignments_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicle_history_events_vehicle_id_fkey') THEN
    ALTER TABLE "vehicle_history_events" ADD CONSTRAINT "vehicle_history_events_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 7. Backfill plates from current vehicles. If duplicated plate numbers exist, use the first vehicle as the plate holder.
INSERT INTO "vehicle_plates" ("plate_number", "owner_company_id", "status", "current_vehicle_id", "created_at", "updated_at")
SELECT rv."plate_number", rv."owner_company_id", 'in_use', rv."id", COALESCE(rv."created_at", CURRENT_TIMESTAMP), CURRENT_TIMESTAMP
FROM (
  SELECT
    v.*,
    ROW_NUMBER() OVER (PARTITION BY v."plate_number" ORDER BY v."id") AS rn
  FROM "vehicles" v
  WHERE v."plate_number" IS NOT NULL AND BTRIM(v."plate_number") <> ''
) rv
WHERE rv.rn = 1
ON CONFLICT ("plate_number") DO NOTHING;

WITH ranked_vehicles AS (
  SELECT
    v."id",
    v."plate_number",
    ROW_NUMBER() OVER (PARTITION BY v."plate_number" ORDER BY v."id") AS rn
  FROM "vehicles" v
  WHERE v."plate_number" IS NOT NULL AND BTRIM(v."plate_number") <> ''
)
UPDATE "vehicles" v
SET "current_plate_id" = vp."id"
FROM ranked_vehicles rv
JOIN "vehicle_plates" vp ON vp."plate_number" = rv."plate_number"
WHERE v."id" = rv."id"
  AND rv.rn = 1
  AND v."current_plate_id" IS NULL;

-- Ensure backfilled plates are marked in use when currently attached to a non-scrapped vehicle.
UPDATE "vehicle_plates" vp
SET "status" = 'in_use',
    "current_vehicle_id" = v."id",
    "owner_company_id" = v."owner_company_id",
    "updated_at" = CURRENT_TIMESTAMP
FROM "vehicles" v
WHERE v."current_plate_id" = vp."id"
  AND v."status" <> 'scrapped'
  AND vp."current_vehicle_id" IS NULL;

-- Backfill one active assignment record per current vehicle/plate pair.
INSERT INTO "vehicle_plate_assignments" ("plate_id", "vehicle_id", "assigned_date", "removed_date", "notes", "created_at")
SELECT v."current_plate_id", v."id", COALESCE(v."created_at"::date, CURRENT_DATE), NULL, '系統從既有車輛資料自動建立', CURRENT_TIMESTAMP
FROM "vehicles" v
WHERE v."current_plate_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "vehicle_plate_assignments" a
    WHERE a."plate_id" = v."current_plate_id" AND a."vehicle_id" = v."id" AND a."removed_date" IS NULL
  );
