-- ============================================================
-- Phase C/D Modifications: Daily Reports & Acceptance Reports
-- ============================================================

-- 1. daily_reports: make project_id optional, add new fields
ALTER TABLE "daily_reports" ALTER COLUMN "daily_report_project_id" DROP NOT NULL;

ALTER TABLE "daily_reports" ADD COLUMN "daily_report_client_id" INTEGER;
ALTER TABLE "daily_reports" ADD COLUMN "daily_report_client_name" VARCHAR(200);
ALTER TABLE "daily_reports" ADD COLUMN "daily_report_client_contract_no" VARCHAR(200);
ALTER TABLE "daily_reports" ADD COLUMN "daily_report_project_name" VARCHAR(200);
ALTER TABLE "daily_reports" ADD COLUMN "daily_report_completed_work" TEXT;
ALTER TABLE "daily_reports" ADD COLUMN "daily_report_signature" TEXT;

ALTER TABLE "daily_reports" ADD CONSTRAINT "daily_reports_daily_report_client_id_fkey"
  FOREIGN KEY ("daily_report_client_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 2. daily_report_items: add new fields for worker/vehicle details
ALTER TABLE "daily_report_items" ADD COLUMN "daily_report_item_worker_type" VARCHAR(100);
ALTER TABLE "daily_report_items" ADD COLUMN "daily_report_item_with_operator" BOOLEAN DEFAULT false;
ALTER TABLE "daily_report_items" ADD COLUMN "daily_report_item_employee_ids" TEXT;
ALTER TABLE "daily_report_items" ADD COLUMN "daily_report_item_vehicle_ids" TEXT;
ALTER TABLE "daily_report_items" ADD COLUMN "daily_report_item_shift_quantity" DECIMAL(10,2);

-- 3. acceptance_reports: add client_contract_no, make inspector optional, add inspector name
ALTER TABLE "acceptance_reports" ADD COLUMN "acceptance_report_client_contract_no" VARCHAR(200);
ALTER TABLE "acceptance_reports" ALTER COLUMN "acceptance_report_mingtat_inspector_id" DROP NOT NULL;
ALTER TABLE "acceptance_reports" ADD COLUMN "acceptance_report_mingtat_inspector_name" VARCHAR(200);

-- 4. Create acceptance_report_items table for dynamic items
CREATE TABLE "acceptance_report_items" (
    "id" SERIAL NOT NULL,
    "acceptance_report_item_report_id" INTEGER NOT NULL,
    "acceptance_report_item_description" TEXT NOT NULL,
    "acceptance_report_item_quantity_unit" VARCHAR(200),
    "acceptance_report_item_sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "acceptance_report_items_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "acceptance_report_items" ADD CONSTRAINT "acceptance_report_items_acceptance_report_item_report_id_fkey"
  FOREIGN KEY ("acceptance_report_item_report_id") REFERENCES "acceptance_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. Seed worker_type field options
INSERT INTO "field_options" ("category", "label", "sort_order", "is_active")
SELECT 'worker_type', t.label, t.sort_order, true
FROM (VALUES
  ('什工', 1),
  ('叻架', 2),
  ('中工石矢工', 3),
  ('中工燒焊工', 4),
  ('中工木工', 5),
  ('中工泥水匠', 6),
  ('搬車司機', 7),
  ('吊車司機', 8),
  ('吊車機手', 9),
  ('大貨車司機', 10),
  ('機手', 11)
) AS t(label, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM "field_options" WHERE "category" = 'worker_type' AND "label" = t.label
);
