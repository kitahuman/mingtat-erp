-- AlterTable
ALTER TABLE "employees" ADD COLUMN "employee_mpf_applied" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "employees" ADD COLUMN "employee_mpf_applied_date" DATE;
