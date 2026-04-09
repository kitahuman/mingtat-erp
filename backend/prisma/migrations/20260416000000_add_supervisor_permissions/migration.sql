-- AlterTable
ALTER TABLE "employees" ADD COLUMN "can_approve_mid_shift" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "employees" ADD COLUMN "can_daily_report" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "employees" ADD COLUMN "can_acceptance_report" BOOLEAN NOT NULL DEFAULT false;
