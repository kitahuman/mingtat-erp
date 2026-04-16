-- ══════════════════════════════════════════════════════════════
-- Migration: Equipment Profit Settings
-- Description: Add machinery_id/vehicle_id to work_logs,
--              vehicle_id to expenses,
--              and create equipment_profit_settings table
-- ══════════════════════════════════════════════════════════════

-- 1. Add machinery_id and vehicle_id to work_logs
ALTER TABLE "work_logs" ADD COLUMN "work_log_machinery_id" INTEGER;
ALTER TABLE "work_logs" ADD COLUMN "work_log_vehicle_id" INTEGER;

-- 2. Add vehicle_id to expenses
ALTER TABLE "expenses" ADD COLUMN "vehicle_id" INTEGER;

-- 3. Create equipment_profit_settings table
CREATE TABLE "equipment_profit_settings" (
    "id" SERIAL NOT NULL,
    "equipment_profit_equipment_type" VARCHAR(20) NOT NULL,
    "equipment_profit_equipment_id" INTEGER NOT NULL,
    "equipment_profit_commission_percentage" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "equipment_profit_settings_pkey" PRIMARY KEY ("id")
);

-- 4. Add unique constraint on (equipment_type, equipment_id)
CREATE UNIQUE INDEX "equipment_profit_settings_type_id_key" ON "equipment_profit_settings"("equipment_profit_equipment_type", "equipment_profit_equipment_id");

-- 5. Add indexes for work_logs FK columns
CREATE INDEX "work_logs_work_log_machinery_id_idx" ON "work_logs"("work_log_machinery_id");
CREATE INDEX "work_logs_work_log_vehicle_id_idx" ON "work_logs"("work_log_vehicle_id");

-- 6. Add index for expenses vehicle_id
CREATE INDEX "expenses_vehicle_id_idx" ON "expenses"("vehicle_id");

-- 7. Add foreign keys
ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_work_log_machinery_id_fkey" FOREIGN KEY ("work_log_machinery_id") REFERENCES "machinery"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_work_log_vehicle_id_fkey" FOREIGN KEY ("work_log_vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 8. Data migration: populate work_log_machinery_id from equipment_source + equipment_number
-- Match where equipment_source indicates machinery (e.g., internal machinery)
UPDATE "work_logs" wl
SET "work_log_machinery_id" = m.id
FROM "machinery" m
WHERE wl."equipment_number" IS NOT NULL
  AND wl."equipment_number" != ''
  AND m."machine_code" = wl."equipment_number"
  AND wl."work_log_machinery_id" IS NULL
  AND (wl."equipment_source" IS NULL OR wl."equipment_source" NOT IN ('subcon', 'external'));

-- 9. Data migration: populate work_log_vehicle_id from equipment_number
-- Match plate_number for vehicles
UPDATE "work_logs" wl
SET "work_log_vehicle_id" = v.id
FROM "vehicles" v
WHERE wl."equipment_number" IS NOT NULL
  AND wl."equipment_number" != ''
  AND v."plate_number" = wl."equipment_number"
  AND wl."work_log_vehicle_id" IS NULL
  AND wl."work_log_machinery_id" IS NULL;
