-- CreateTable: payroll_payments (糧單付款記錄)
CREATE TABLE IF NOT EXISTS "payroll_payments" (
    "id" SERIAL NOT NULL,
    "payroll_payment_payroll_id" INTEGER NOT NULL,
    "payroll_payment_date" DATE NOT NULL,
    "payroll_payment_amount" DECIMAL(14,2) NOT NULL,
    "payroll_payment_reference_no" VARCHAR(100),
    "payroll_payment_bank_account" VARCHAR(100),
    "payroll_payment_remarks" TEXT,
    "payroll_payment_payment_out_id" INTEGER,
    "payroll_payment_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payroll_payment_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "payroll_payments_payroll_payment_payroll_id_idx" ON "payroll_payments"("payroll_payment_payroll_id");

-- AddForeignKey
ALTER TABLE "payroll_payments" ADD CONSTRAINT "payroll_payments_payroll_payment_payroll_id_fkey" FOREIGN KEY ("payroll_payment_payroll_id") REFERENCES "payrolls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_payments" ADD CONSTRAINT "payroll_payments_payroll_payment_payment_out_id_fkey" FOREIGN KEY ("payroll_payment_payment_out_id") REFERENCES "payment_outs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
