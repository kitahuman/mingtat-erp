ALTER TABLE "payroll_payments" ADD COLUMN IF NOT EXISTS "payroll_payment_method" VARCHAR(50) NULL;
ALTER TABLE "payment_outs" ADD COLUMN IF NOT EXISTS "payment_method" VARCHAR(50) NULL;
