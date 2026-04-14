-- ══════════════════════════════════════════════════════════════
-- 新增軟刪除記錄刪除者欄位
-- ══════════════════════════════════════════════════════════════

ALTER TABLE "companies" ADD COLUMN "deleted_by" INTEGER;
ALTER TABLE "companies" ADD CONSTRAINT "companies_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "employees" ADD COLUMN "deleted_by" INTEGER;
ALTER TABLE "employees" ADD CONSTRAINT "employees_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "vehicles" ADD COLUMN "deleted_by" INTEGER;
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "machinery" ADD COLUMN "deleted_by" INTEGER;
ALTER TABLE "machinery" ADD CONSTRAINT "machinery_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "partners" ADD COLUMN "deleted_by" INTEGER;
ALTER TABLE "partners" ADD CONSTRAINT "partners_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "contracts" ADD COLUMN "deleted_by" INTEGER;
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "projects" ADD COLUMN "deleted_by" INTEGER;
ALTER TABLE "projects" ADD CONSTRAINT "projects_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "quotations" ADD COLUMN "deleted_by" INTEGER;
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "rate_cards" ADD COLUMN "deleted_by" INTEGER;
ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "expenses" ADD COLUMN "deleted_by" INTEGER;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "invoices" ADD COLUMN "deleted_by" INTEGER;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "work_logs" ADD COLUMN "deleted_by" INTEGER;
ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "daily_reports" ADD COLUMN "daily_report_deleted_by" INTEGER;
ALTER TABLE "daily_reports" ADD CONSTRAINT "daily_reports_deleted_by_fkey" FOREIGN KEY ("daily_report_deleted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
