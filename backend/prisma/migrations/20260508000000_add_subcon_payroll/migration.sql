-- CreateTable: subcon_payrolls (判頭糧單主表)
CREATE TABLE "subcon_payrolls" (
    "subcon_payroll_id" SERIAL NOT NULL,
    "subcon_payroll_subcontractor_id" INTEGER NOT NULL,
    "subcon_payroll_month" DATE NOT NULL,
    "subcon_payroll_total_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "subcon_payroll_status" VARCHAR(30) NOT NULL DEFAULT 'draft',
    "subcon_payroll_confirmed_at" TIMESTAMP(3),
    "subcon_payroll_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subcon_payroll_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subcon_payrolls_pkey" PRIMARY KEY ("subcon_payroll_id")
);

-- CreateTable: subcon_payroll_items (判頭糧單明細表)
CREATE TABLE "subcon_payroll_items" (
    "subcon_payroll_item_id" SERIAL NOT NULL,
    "subcon_payroll_item_payroll_id" INTEGER NOT NULL,
    "subcon_payroll_item_driver_id" INTEGER,
    "subcon_payroll_item_driver_name" VARCHAR(100) NOT NULL,
    "subcon_payroll_item_work_date" DATE NOT NULL,
    "subcon_payroll_item_work_content" TEXT,
    "subcon_payroll_item_quantity" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "subcon_payroll_item_unit" VARCHAR(20) NOT NULL,
    "subcon_payroll_item_unit_price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "subcon_payroll_item_subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "subcon_payroll_item_work_log_id" INTEGER,
    "subcon_payroll_item_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subcon_payroll_items_pkey" PRIMARY KEY ("subcon_payroll_item_id")
);

-- CreateIndex
CREATE INDEX "subcon_payrolls_subcon_payroll_subcontractor_id_idx" ON "subcon_payrolls"("subcon_payroll_subcontractor_id");
CREATE INDEX "subcon_payrolls_subcon_payroll_month_idx" ON "subcon_payrolls"("subcon_payroll_month");
CREATE INDEX "subcon_payrolls_subcon_payroll_status_idx" ON "subcon_payrolls"("subcon_payroll_status");
CREATE INDEX "subcon_payrolls_subcon_payroll_subcontractor_id_subcon_payro_idx" ON "subcon_payrolls"("subcon_payroll_subcontractor_id", "subcon_payroll_month");

CREATE INDEX "subcon_payroll_items_subcon_payroll_item_payroll_id_idx" ON "subcon_payroll_items"("subcon_payroll_item_payroll_id");
CREATE INDEX "subcon_payroll_items_subcon_payroll_item_work_log_id_idx" ON "subcon_payroll_items"("subcon_payroll_item_work_log_id");
CREATE INDEX "subcon_payroll_items_subcon_payroll_item_driver_id_idx" ON "subcon_payroll_items"("subcon_payroll_item_driver_id");

-- AddForeignKey
ALTER TABLE "subcon_payrolls" ADD CONSTRAINT "subcon_payrolls_subcon_payroll_subcontractor_id_fkey" FOREIGN KEY ("subcon_payroll_subcontractor_id") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "subcon_payroll_items" ADD CONSTRAINT "subcon_payroll_items_subcon_payroll_item_payroll_id_fkey" FOREIGN KEY ("subcon_payroll_item_payroll_id") REFERENCES "subcon_payrolls"("subcon_payroll_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "subcon_payroll_items" ADD CONSTRAINT "subcon_payroll_items_subcon_payroll_item_driver_id_fkey" FOREIGN KEY ("subcon_payroll_item_driver_id") REFERENCES "subcontractor_fleet_drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "subcon_payroll_items" ADD CONSTRAINT "subcon_payroll_items_subcon_payroll_item_work_log_id_fkey" FOREIGN KEY ("subcon_payroll_item_work_log_id") REFERENCES "work_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
