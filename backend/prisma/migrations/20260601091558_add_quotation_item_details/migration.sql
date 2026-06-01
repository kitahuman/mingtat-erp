-- AlterTable
ALTER TABLE "quotation_items" ADD COLUMN "qi_service_type" TEXT,
ADD COLUMN "qi_day_night" TEXT,
ADD COLUMN "qi_tonnage" TEXT,
ADD COLUMN "qi_machine_type" TEXT,
ADD COLUMN "qi_origin" TEXT,
ADD COLUMN "qi_destination" TEXT,
ADD COLUMN "qi_ot_rate" DECIMAL(12,2),
ADD COLUMN "qi_mid_shift_rate" DECIMAL(12,2),
ADD COLUMN "qi_sync_to_rate_card" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN "audit_remarks" TEXT;
