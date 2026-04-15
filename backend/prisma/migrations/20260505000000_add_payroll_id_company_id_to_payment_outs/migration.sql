-- Add payroll_id and company_id to payment_outs table
ALTER TABLE "payment_outs" ADD COLUMN IF NOT EXISTS "payroll_id" INTEGER;
ALTER TABLE "payment_outs" ADD COLUMN IF NOT EXISTS "company_id" INTEGER;

-- AddForeignKey: payroll_id -> payrolls
ALTER TABLE "payment_outs" ADD CONSTRAINT "payment_outs_payroll_id_fkey"
  FOREIGN KEY ("payroll_id") REFERENCES "payrolls"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: company_id -> companies
ALTER TABLE "payment_outs" ADD CONSTRAINT "payment_outs_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex for performance
CREATE INDEX IF NOT EXISTS "payment_outs_payroll_id_idx" ON "payment_outs"("payroll_id");
CREATE INDEX IF NOT EXISTS "payment_outs_company_id_idx" ON "payment_outs"("company_id");
