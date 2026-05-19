ALTER TABLE "employees"
  ADD COLUMN IF NOT EXISTS "petty_cash_balance" DECIMAL(12, 2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "petty_cash_records" (
  "id" SERIAL PRIMARY KEY,
  "employee_id" INTEGER NOT NULL,
  "date" DATE NOT NULL,
  "type" VARCHAR(30) NOT NULL,
  "amount" DECIMAL(12, 2) NOT NULL,
  "balance" DECIMAL(12, 2) NOT NULL,
  "description" TEXT,
  "expense_id" INTEGER,
  "payroll_id" INTEGER,
  "period" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "petty_cash_records_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "petty_cash_records_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "petty_cash_records_payroll_id_fkey" FOREIGN KEY ("payroll_id") REFERENCES "payrolls"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "petty_cash_records_employee_id_idx" ON "petty_cash_records"("employee_id");
CREATE INDEX IF NOT EXISTS "petty_cash_records_expense_id_idx" ON "petty_cash_records"("expense_id");
CREATE INDEX IF NOT EXISTS "petty_cash_records_payroll_id_idx" ON "petty_cash_records"("payroll_id");
CREATE INDEX IF NOT EXISTS "petty_cash_records_period_idx" ON "petty_cash_records"("period");
CREATE INDEX IF NOT EXISTS "petty_cash_records_type_idx" ON "petty_cash_records"("type");
