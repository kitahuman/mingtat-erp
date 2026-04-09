-- Move supervisor permission fields from employees to users table

-- Step 1: Add columns to users table
ALTER TABLE "users" ADD COLUMN "can_approve_mid_shift" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "can_daily_report" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "can_acceptance_report" BOOLEAN NOT NULL DEFAULT false;

-- Step 2: Remove columns from employees table
ALTER TABLE "employees" DROP COLUMN IF EXISTS "can_approve_mid_shift";
ALTER TABLE "employees" DROP COLUMN IF EXISTS "can_daily_report";
ALTER TABLE "employees" DROP COLUMN IF EXISTS "can_acceptance_report";
