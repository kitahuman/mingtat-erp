-- Add deleted_at column to companies table
ALTER TABLE "companies" ADD COLUMN "deleted_at" TIMESTAMP(3);

-- Add deleted_at column to employees table
ALTER TABLE "employees" ADD COLUMN "deleted_at" TIMESTAMP(3);

-- Add deleted_at column to vehicles table
ALTER TABLE "vehicles" ADD COLUMN "deleted_at" TIMESTAMP(3);

-- Add deleted_at column to machinery table
ALTER TABLE "machinery" ADD COLUMN "deleted_at" TIMESTAMP(3);

-- Add deleted_at column to partners table
ALTER TABLE "partners" ADD COLUMN "deleted_at" TIMESTAMP(3);

-- Add deleted_at column to contracts table
ALTER TABLE "contracts" ADD COLUMN "deleted_at" TIMESTAMP(3);

-- Add deleted_at column to projects table
ALTER TABLE "projects" ADD COLUMN "deleted_at" TIMESTAMP(3);

-- Add deleted_at column to quotations table
ALTER TABLE "quotations" ADD COLUMN "deleted_at" TIMESTAMP(3);

-- Add deleted_at column to rate_cards table
ALTER TABLE "rate_cards" ADD COLUMN "deleted_at" TIMESTAMP(3);

-- Add deleted_at column to expenses table
ALTER TABLE "expenses" ADD COLUMN "deleted_at" TIMESTAMP(3);

-- Add deleted_at column to invoices table
ALTER TABLE "invoices" ADD COLUMN "deleted_at" TIMESTAMP(3);

-- Add deleted_at column to work_logs table
ALTER TABLE "work_logs" ADD COLUMN "deleted_at" TIMESTAMP(3);

-- Add deleted_at column to daily_reports table
ALTER TABLE "daily_reports" ADD COLUMN "daily_report_deleted_at" TIMESTAMP(3);

-- Create indexes for soft delete queries
CREATE INDEX "companies_deleted_at_idx" ON "companies"("deleted_at");
CREATE INDEX "employees_deleted_at_idx" ON "employees"("deleted_at");
CREATE INDEX "vehicles_deleted_at_idx" ON "vehicles"("deleted_at");
CREATE INDEX "machinery_deleted_at_idx" ON "machinery"("deleted_at");
CREATE INDEX "partners_deleted_at_idx" ON "partners"("deleted_at");
CREATE INDEX "contracts_deleted_at_idx" ON "contracts"("deleted_at");
CREATE INDEX "projects_deleted_at_idx" ON "projects"("deleted_at");
CREATE INDEX "quotations_deleted_at_idx" ON "quotations"("deleted_at");
CREATE INDEX "rate_cards_deleted_at_idx" ON "rate_cards"("deleted_at");
CREATE INDEX "expenses_deleted_at_idx" ON "expenses"("deleted_at");
CREATE INDEX "invoices_deleted_at_idx" ON "invoices"("deleted_at");
CREATE INDEX "work_logs_deleted_at_idx" ON "work_logs"("deleted_at");
CREATE INDEX "daily_reports_deleted_at_idx" ON "daily_reports"("daily_report_deleted_at");
