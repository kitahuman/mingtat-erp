-- Phase 4: PaymentIn (收款記錄)
CREATE TABLE "payment_ins" (
    "id" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "source_type" VARCHAR(30) NOT NULL,
    "source_ref_id" INTEGER,
    "project_id" INTEGER,
    "contract_id" INTEGER,
    "bank_account" VARCHAR(100),
    "reference_no" VARCHAR(100),
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_ins_pkey" PRIMARY KEY ("id")
);

-- Phase 4: PaymentOut (付款記錄)
CREATE TABLE "payment_outs" (
    "id" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "expense_id" INTEGER,
    "project_id" INTEGER,
    "bank_account" VARCHAR(100),
    "reference_no" VARCHAR(100),
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_outs_pkey" PRIMARY KEY ("id")
);

-- Phase 6: RetentionTracking (扣留金追蹤)
CREATE TABLE "retention_trackings" (
    "id" SERIAL NOT NULL,
    "contract_id" INTEGER NOT NULL,
    "payment_application_id" INTEGER NOT NULL,
    "pa_no" INTEGER NOT NULL,
    "retention_amount" DECIMAL(14,2) NOT NULL,
    "cumulative_retention" DECIMAL(14,2) NOT NULL,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retention_trackings_pkey" PRIMARY KEY ("id")
);

-- Phase 6: RetentionRelease (扣留金釋放)
CREATE TABLE "retention_releases" (
    "id" SERIAL NOT NULL,
    "contract_id" INTEGER NOT NULL,
    "release_date" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reason" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "payment_in_id" INTEGER,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retention_releases_pkey" PRIMARY KEY ("id")
);

-- Unique constraint for RetentionTracking
CREATE UNIQUE INDEX "retention_trackings_contract_id_payment_application_id_key" ON "retention_trackings"("contract_id", "payment_application_id");
CREATE UNIQUE INDEX "retention_trackings_payment_application_id_key" ON "retention_trackings"("payment_application_id");

-- Foreign keys
ALTER TABLE "payment_ins" ADD CONSTRAINT "payment_ins_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payment_ins" ADD CONSTRAINT "payment_ins_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payment_outs" ADD CONSTRAINT "payment_outs_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payment_outs" ADD CONSTRAINT "payment_outs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "retention_trackings" ADD CONSTRAINT "retention_trackings_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "retention_trackings" ADD CONSTRAINT "retention_trackings_payment_application_id_fkey" FOREIGN KEY ("payment_application_id") REFERENCES "payment_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "retention_releases" ADD CONSTRAINT "retention_releases_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
