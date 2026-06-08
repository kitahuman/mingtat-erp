-- CreateTable
CREATE TABLE "invoice_statements" (
    "id" SERIAL NOT NULL,
    "statement_no" VARCHAR(50) NOT NULL,
    "statement_title" VARCHAR(200),
    "company_id" INTEGER NOT NULL,
    "client_id" INTEGER NOT NULL,
    "statement_period_start" DATE NOT NULL,
    "statement_period_end" DATE NOT NULL,
    "statement_subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "statement_other_charges" JSONB,
    "statement_total_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "statement_invoice_count" INTEGER NOT NULL DEFAULT 0,
    "statement_remarks" TEXT,
    "statement_status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "invoice_statements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_statement_items" (
    "id" SERIAL NOT NULL,
    "statement_id" INTEGER NOT NULL,
    "invoice_id" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "invoice_statement_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_statement_sequences" (
    "id" SERIAL NOT NULL,
    "prefix" VARCHAR(50) NOT NULL,
    "year_month" VARCHAR(4) NOT NULL,
    "last_seq" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "invoice_statement_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invoice_statements_statement_no_key" ON "invoice_statements"("statement_no");

-- CreateIndex
CREATE INDEX "invoice_statements_company_id_idx" ON "invoice_statements"("company_id");

-- CreateIndex
CREATE INDEX "invoice_statements_client_id_idx" ON "invoice_statements"("client_id");

-- CreateIndex
CREATE INDEX "invoice_statements_statement_status_idx" ON "invoice_statements"("statement_status");

-- CreateIndex
CREATE INDEX "invoice_statements_statement_period_start_idx" ON "invoice_statements"("statement_period_start");

-- CreateIndex
CREATE INDEX "invoice_statements_deleted_at_idx" ON "invoice_statements"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_statement_items_statement_id_invoice_id_key" ON "invoice_statement_items"("statement_id", "invoice_id");

-- CreateIndex
CREATE INDEX "invoice_statement_items_invoice_id_idx" ON "invoice_statement_items"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_statement_sequences_prefix_year_month_key" ON "invoice_statement_sequences"("prefix", "year_month");

-- AddForeignKey
ALTER TABLE "invoice_statements" ADD CONSTRAINT "invoice_statements_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_statements" ADD CONSTRAINT "invoice_statements_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_statements" ADD CONSTRAINT "invoice_statements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_statement_items" ADD CONSTRAINT "invoice_statement_items_statement_id_fkey" FOREIGN KEY ("statement_id") REFERENCES "invoice_statements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_statement_items" ADD CONSTRAINT "invoice_statement_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
