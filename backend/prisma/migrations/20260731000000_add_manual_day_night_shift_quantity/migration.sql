-- AlterTable: Add manual_day_shift_quantity and manual_night_shift_quantity to payroll_daily_calcs
ALTER TABLE "payroll_daily_calcs" ADD COLUMN "manual_day_shift_quantity" DECIMAL(10,2);
ALTER TABLE "payroll_daily_calcs" ADD COLUMN "manual_night_shift_quantity" DECIMAL(10,2);
