-- ══════════════════════════════════════════════════════════════
-- PaymentInDeduction: 收款扣減明細表
-- 記錄 Retention / Contra Charge / Other 扣減
-- ══════════════════════════════════════════════════════════════

-- CreateTable
CREATE TABLE IF NOT EXISTS "payment_in_deductions" (
    "id" SERIAL NOT NULL,
    "payment_in_deduction_payment_in_id" INTEGER NOT NULL,
    "payment_in_deduction_invoice_id" INTEGER,
    "payment_in_deduction_type" VARCHAR(50) NOT NULL,
    "payment_in_deduction_amount" DECIMAL(14,2) NOT NULL,
    "payment_in_deduction_remarks" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_in_deductions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "payment_in_deductions_payment_in_id_idx" ON "payment_in_deductions"("payment_in_deduction_payment_in_id");
CREATE INDEX IF NOT EXISTS "payment_in_deductions_invoice_id_idx" ON "payment_in_deductions"("payment_in_deduction_invoice_id");

-- AddForeignKey
ALTER TABLE "payment_in_deductions"
    ADD CONSTRAINT "payment_in_deductions_payment_in_fkey"
    FOREIGN KEY ("payment_in_deduction_payment_in_id")
    REFERENCES "payment_ins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payment_in_deductions"
    ADD CONSTRAINT "payment_in_deductions_invoice_fkey"
    FOREIGN KEY ("payment_in_deduction_invoice_id")
    REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
