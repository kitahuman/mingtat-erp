-- Phase 3: Payment Application (IPA / 計糧)

-- Add retention fields to contracts
ALTER TABLE "contracts" ADD COLUMN "retention_rate" DECIMAL(5,4) NOT NULL DEFAULT 0.10;
ALTER TABLE "contracts" ADD COLUMN "retention_cap_rate" DECIMAL(5,4) NOT NULL DEFAULT 0.05;

-- Payment Applications
CREATE TABLE "payment_applications" (
    "id" SERIAL NOT NULL,
    "contract_id" INTEGER NOT NULL,
    "project_id" INTEGER,
    "pa_no" INTEGER NOT NULL,
    "reference" VARCHAR(100) NOT NULL,
    "period_from" DATE,
    "period_to" DATE NOT NULL,
    "submission_date" DATE,
    "certification_date" DATE,
    "payment_due_date" DATE,
    "bq_work_done" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "vo_work_done" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cumulative_work_done" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "materials_on_site" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "gross_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "retention_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "after_retention" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "other_deductions" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "certified_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "prev_certified_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "current_due" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "client_certified_amount" DECIMAL(14,2),
    "client_current_due" DECIMAL(14,2),
    "paid_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paid_date" DATE,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payment_applications_pkey" PRIMARY KEY ("id")
);

-- Payment BQ Progress
CREATE TABLE "payment_bq_progress" (
    "id" SERIAL NOT NULL,
    "payment_application_id" INTEGER NOT NULL,
    "bq_item_id" INTEGER NOT NULL,
    "prev_cumulative_qty" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "current_cumulative_qty" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "this_period_qty" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "unit_rate" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "prev_cumulative_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "current_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "this_period_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payment_bq_progress_pkey" PRIMARY KEY ("id")
);

-- Payment VO Progress
CREATE TABLE "payment_vo_progress" (
    "id" SERIAL NOT NULL,
    "payment_application_id" INTEGER NOT NULL,
    "vo_item_id" INTEGER NOT NULL,
    "prev_cumulative_qty" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "current_cumulative_qty" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "this_period_qty" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "unit_rate" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "prev_cumulative_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "current_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "this_period_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payment_vo_progress_pkey" PRIMARY KEY ("id")
);

-- Payment Deductions
CREATE TABLE "payment_deductions" (
    "id" SERIAL NOT NULL,
    "payment_application_id" INTEGER NOT NULL,
    "deduction_type" VARCHAR(50) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payment_deductions_pkey" PRIMARY KEY ("id")
);

-- Payment Materials
CREATE TABLE "payment_materials" (
    "id" SERIAL NOT NULL,
    "payment_application_id" INTEGER NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payment_materials_pkey" PRIMARY KEY ("id")
);

-- Unique constraints
CREATE UNIQUE INDEX "payment_applications_contract_id_pa_no_key" ON "payment_applications"("contract_id", "pa_no");
CREATE UNIQUE INDEX "payment_bq_progress_payment_application_id_bq_item_id_key" ON "payment_bq_progress"("payment_application_id", "bq_item_id");
CREATE UNIQUE INDEX "payment_vo_progress_payment_application_id_vo_item_id_key" ON "payment_vo_progress"("payment_application_id", "vo_item_id");

-- Foreign keys
ALTER TABLE "payment_applications" ADD CONSTRAINT "payment_applications_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_applications" ADD CONSTRAINT "payment_applications_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payment_bq_progress" ADD CONSTRAINT "payment_bq_progress_payment_application_id_fkey" FOREIGN KEY ("payment_application_id") REFERENCES "payment_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_bq_progress" ADD CONSTRAINT "payment_bq_progress_bq_item_id_fkey" FOREIGN KEY ("bq_item_id") REFERENCES "contract_bq_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_vo_progress" ADD CONSTRAINT "payment_vo_progress_payment_application_id_fkey" FOREIGN KEY ("payment_application_id") REFERENCES "payment_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_vo_progress" ADD CONSTRAINT "payment_vo_progress_vo_item_id_fkey" FOREIGN KEY ("vo_item_id") REFERENCES "variation_order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_deductions" ADD CONSTRAINT "payment_deductions_payment_application_id_fkey" FOREIGN KEY ("payment_application_id") REFERENCES "payment_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_materials" ADD CONSTRAINT "payment_materials_payment_application_id_fkey" FOREIGN KEY ("payment_application_id") REFERENCES "payment_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
