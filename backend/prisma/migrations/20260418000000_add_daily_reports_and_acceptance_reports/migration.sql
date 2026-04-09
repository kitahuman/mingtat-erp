-- CreateTable: daily_reports
CREATE TABLE "daily_reports" (
    "id" SERIAL NOT NULL,
    "daily_report_project_id" INTEGER NOT NULL,
    "daily_report_date" DATE NOT NULL,
    "daily_report_shift_type" VARCHAR(20) NOT NULL,
    "daily_report_work_summary" TEXT NOT NULL,
    "daily_report_memo" TEXT,
    "daily_report_created_by" INTEGER NOT NULL,
    "daily_report_status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "daily_report_submitted_at" TIMESTAMP(3),
    "daily_report_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "daily_report_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable: daily_report_items
CREATE TABLE "daily_report_items" (
    "id" SERIAL NOT NULL,
    "daily_report_item_report_id" INTEGER NOT NULL,
    "daily_report_item_category" VARCHAR(30) NOT NULL,
    "daily_report_item_content" VARCHAR(200) NOT NULL,
    "daily_report_item_quantity" DECIMAL(10,2),
    "daily_report_item_ot_hours" DECIMAL(10,2),
    "daily_report_item_name_or_plate" VARCHAR(200),
    "daily_report_item_sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "daily_report_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable: acceptance_reports
CREATE TABLE "acceptance_reports" (
    "id" SERIAL NOT NULL,
    "acceptance_report_date" DATE NOT NULL,
    "acceptance_report_acceptance_date" DATE NOT NULL,
    "acceptance_report_client_id" INTEGER,
    "acceptance_report_client_name" VARCHAR(200) NOT NULL,
    "acceptance_report_project_id" INTEGER,
    "acceptance_report_project_name" VARCHAR(200) NOT NULL,
    "acceptance_report_contract_ref" VARCHAR(200),
    "acceptance_report_site_address" TEXT NOT NULL,
    "acceptance_report_items" TEXT NOT NULL,
    "acceptance_report_quantity_unit" VARCHAR(100),
    "acceptance_report_mingtat_inspector_id" INTEGER NOT NULL,
    "acceptance_report_mingtat_inspector_title" VARCHAR(100) NOT NULL,
    "acceptance_report_client_inspector_name" VARCHAR(200) NOT NULL,
    "acceptance_report_client_inspector_title" VARCHAR(100) NOT NULL,
    "acceptance_report_client_signature" TEXT,
    "acceptance_report_mingtat_signature" TEXT,
    "acceptance_report_supplementary_notes" TEXT,
    "acceptance_report_created_by" INTEGER NOT NULL,
    "acceptance_report_status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "acceptance_report_submitted_at" TIMESTAMP(3),
    "acceptance_report_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptance_report_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "acceptance_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable: acceptance_report_attachments
CREATE TABLE "acceptance_report_attachments" (
    "id" SERIAL NOT NULL,
    "acceptance_report_attachment_report_id" INTEGER NOT NULL,
    "acceptance_report_attachment_file_name" VARCHAR(255) NOT NULL,
    "acceptance_report_attachment_file_url" TEXT NOT NULL,
    "acceptance_report_attachment_file_type" VARCHAR(100) NOT NULL,
    "acceptance_report_attachment_sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "acceptance_report_attachments_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "daily_reports" ADD CONSTRAINT "daily_reports_daily_report_project_id_fkey" FOREIGN KEY ("daily_report_project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_reports" ADD CONSTRAINT "daily_reports_daily_report_created_by_fkey" FOREIGN KEY ("daily_report_created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_report_items" ADD CONSTRAINT "daily_report_items_daily_report_item_report_id_fkey" FOREIGN KEY ("daily_report_item_report_id") REFERENCES "daily_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acceptance_reports" ADD CONSTRAINT "acceptance_reports_acceptance_report_client_id_fkey" FOREIGN KEY ("acceptance_report_client_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acceptance_reports" ADD CONSTRAINT "acceptance_reports_acceptance_report_project_id_fkey" FOREIGN KEY ("acceptance_report_project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acceptance_reports" ADD CONSTRAINT "acceptance_reports_acceptance_report_mingtat_inspector_id_fkey" FOREIGN KEY ("acceptance_report_mingtat_inspector_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acceptance_reports" ADD CONSTRAINT "acceptance_reports_acceptance_report_created_by_fkey" FOREIGN KEY ("acceptance_report_created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acceptance_report_attachments" ADD CONSTRAINT "acceptance_report_attachments_acceptance_report_attachment_r_fkey" FOREIGN KEY ("acceptance_report_attachment_report_id") REFERENCES "acceptance_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
