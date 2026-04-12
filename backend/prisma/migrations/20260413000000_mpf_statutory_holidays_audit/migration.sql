-- Feature 1: MPF Calculation Improvements
-- AddColumn: mpf_relevant_income to payrolls (manual salary base for non-industry MPF plans)
ALTER TABLE "payrolls" ADD COLUMN IF NOT EXISTS "mpf_relevant_income" DECIMAL(12, 2);

-- Feature 2: Statutory Holiday Management
-- CreateTable: statutory_holidays
CREATE TABLE IF NOT EXISTS "statutory_holidays" (
    "id" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "statutory_holidays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique date for statutory_holidays
CREATE UNIQUE INDEX IF NOT EXISTS "statutory_holidays_date_key" ON "statutory_holidays"("date");
