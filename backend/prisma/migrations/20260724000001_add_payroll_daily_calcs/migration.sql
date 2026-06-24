-- CreateTable
CREATE TABLE "payroll_daily_calcs" (
    "id" SERIAL NOT NULL,
    "payroll_id" INTEGER NOT NULL,
    "calc_date" DATE NOT NULL,
    "manual_day_quantity" DECIMAL(10,2),
    "is_manual_day_quantity" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_daily_calcs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payroll_daily_calcs_payroll_id_idx" ON "payroll_daily_calcs"("payroll_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_daily_calcs_payroll_id_calc_date_key" ON "payroll_daily_calcs"("payroll_id", "calc_date");

-- AddForeignKey
ALTER TABLE "payroll_daily_calcs" ADD CONSTRAINT "payroll_daily_calcs_payroll_id_fkey" FOREIGN KEY ("payroll_id") REFERENCES "payrolls"("id") ON DELETE CASCADE ON UPDATE CASCADE;
