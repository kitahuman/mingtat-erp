-- Phase 1 payroll updates: night base salary and work nights
ALTER TABLE "employee_salary_settings"
ADD COLUMN "base_salary_night" DECIMAL(10, 2) NOT NULL DEFAULT 0;

ALTER TABLE "payrolls"
ADD COLUMN "work_nights" DECIMAL(10, 2) NOT NULL DEFAULT 0;
