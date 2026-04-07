-- AlterTable: Add new vehicle fields
ALTER TABLE "vehicles" ADD COLUMN "vehicle_first_reg_date" DATE;
ALTER TABLE "vehicles" ADD COLUMN "vehicle_chassis_no" TEXT;
ALTER TABLE "vehicles" ADD COLUMN "vehicle_electronic_comm" TEXT;
ALTER TABLE "vehicles" ADD COLUMN "vehicle_autotoll_collected" TEXT;
ALTER TABLE "vehicles" ADD COLUMN "vehicle_autotoll" TEXT;
ALTER TABLE "vehicles" ADD COLUMN "vehicle_inspection_notes" TEXT;
ALTER TABLE "vehicles" ADD COLUMN "vehicle_insurance_agent" TEXT;
ALTER TABLE "vehicles" ADD COLUMN "vehicle_insurance_company" TEXT;
ALTER TABLE "vehicles" ADD COLUMN "vehicle_has_gps" BOOLEAN;
ALTER TABLE "vehicles" ADD COLUMN "vehicle_mud_tail_expiry" DATE;
ALTER TABLE "vehicles" ADD COLUMN "vehicle_original_plate" TEXT;
ALTER TABLE "vehicles" ADD COLUMN "vehicle_owner_name" TEXT;
