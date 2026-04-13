-- AlterTable: Add product name and product unit fields to work_logs
ALTER TABLE "work_logs" ADD COLUMN "work_log_product_name" TEXT;
ALTER TABLE "work_logs" ADD COLUMN "work_log_product_unit" TEXT;

-- AlterTable: Add product name and product unit fields to payroll_work_logs (for future payroll copy)
ALTER TABLE "payroll_work_logs" ADD COLUMN "payroll_work_log_product_name" TEXT;
ALTER TABLE "payroll_work_logs" ADD COLUMN "payroll_work_log_product_unit" TEXT;
