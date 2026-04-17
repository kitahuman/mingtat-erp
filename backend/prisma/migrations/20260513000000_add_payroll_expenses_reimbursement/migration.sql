-- CreateTable
CREATE TABLE "payroll_expenses" (
    "id" SERIAL NOT NULL,
    "payroll_expense_payroll_id" INTEGER NOT NULL,
    "payroll_expense_expense_id" INTEGER NOT NULL,
    "payroll_expense_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_expenses_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN "expense_settled_payroll_id" INTEGER;

-- CreateIndex
CREATE INDEX "payroll_expenses_payroll_expense_payroll_id_idx" ON "payroll_expenses"("payroll_expense_payroll_id");

-- CreateIndex
CREATE INDEX "payroll_expenses_payroll_expense_expense_id_idx" ON "payroll_expenses"("payroll_expense_expense_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_expenses_payroll_expense_payroll_id_payroll_expense_e_key" ON "payroll_expenses"("payroll_expense_payroll_id", "payroll_expense_expense_id");

-- AddForeignKey
ALTER TABLE "payroll_expenses" ADD CONSTRAINT "payroll_expenses_payroll_expense_payroll_id_fkey" FOREIGN KEY ("payroll_expense_payroll_id") REFERENCES "payrolls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_expenses" ADD CONSTRAINT "payroll_expenses_payroll_expense_expense_id_fkey" FOREIGN KEY ("payroll_expense_expense_id") REFERENCES "expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_expense_settled_payroll_id_fkey" FOREIGN KEY ("expense_settled_payroll_id") REFERENCES "payrolls"("id") ON DELETE SET NULL ON UPDATE CASCADE;
