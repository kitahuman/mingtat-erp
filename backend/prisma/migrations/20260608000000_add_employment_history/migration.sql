-- ══════════════════════════════════════════════════════════════
-- Employment history tracking for employee terminate/reinstate flow
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "employment_history" (
  "id" SERIAL NOT NULL,
  "employee_id" INTEGER NOT NULL,
  "event_type" VARCHAR(20) NOT NULL,
  "event_date" DATE NOT NULL,
  "reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "employment_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "employment_history_event_type_check" CHECK ("event_type" IN ('termination', 'reinstatement'))
);

ALTER TABLE "employment_history"
  DROP CONSTRAINT IF EXISTS "employment_history_employee_id_fkey";
ALTER TABLE "employment_history"
  ADD CONSTRAINT "employment_history_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "employees"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "employment_history_employee_id_idx" ON "employment_history"("employee_id");
CREATE INDEX IF NOT EXISTS "employment_history_event_date_idx" ON "employment_history"("event_date");
CREATE INDEX IF NOT EXISTS "employment_history_event_type_idx" ON "employment_history"("event_type");
