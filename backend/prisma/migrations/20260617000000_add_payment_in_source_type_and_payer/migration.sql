-- CreateTable: payment_in_source_types
CREATE TABLE "payment_in_source_types" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "has_recalculation" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_in_source_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_in_source_types_code_key" ON "payment_in_source_types"("code");

-- Seed system source types
INSERT INTO "payment_in_source_types" ("code", "label", "is_system", "has_recalculation", "is_active", "sort_order") VALUES
('invoice', '發票', true, true, true, 1),
('payment_certificate', 'Payment Certificate', true, true, true, 2),
('retention_release', '扣留金釋放', true, false, true, 3),
('other', '其他收入', true, false, true, 4);

-- Add payer fields to payment_ins
ALTER TABLE "payment_ins" ADD COLUMN "payer_partner_id" INTEGER;
ALTER TABLE "payment_ins" ADD COLUMN "payer_name" VARCHAR(255);

-- Add FK constraint
ALTER TABLE "payment_ins" ADD CONSTRAINT "payment_ins_payer_partner_id_fkey"
    FOREIGN KEY ("payer_partner_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Create index for payer_partner_id
CREATE INDEX "payment_ins_payer_partner_id_idx" ON "payment_ins"("payer_partner_id");
