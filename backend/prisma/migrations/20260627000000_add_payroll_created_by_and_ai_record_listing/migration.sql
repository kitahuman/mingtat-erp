-- Add creator tracking for payroll records and backfill from audit logs when available.
ALTER TABLE "payrolls" ADD COLUMN IF NOT EXISTS "payroll_created_by" INTEGER;

WITH creator_logs AS (
  SELECT DISTINCT ON ("audit_target_id")
         "audit_target_id",
         "audit_user_id"
    FROM "audit_logs"
   WHERE "audit_target_table" = 'payrolls'
     AND "audit_action" = 'create'
   ORDER BY "audit_target_id", "audit_timestamp" ASC
)
UPDATE "payrolls" p
   SET "payroll_created_by" = creator_logs."audit_user_id"
  FROM creator_logs
 WHERE p."id" = creator_logs."audit_target_id"
   AND p."payroll_created_by" IS NULL
   AND COALESCE(p."payroll_ai_generated", false) = false;

CREATE INDEX IF NOT EXISTS "payrolls_payroll_created_by_idx" ON "payrolls"("payroll_created_by");

ALTER TABLE "payrolls"
  DROP CONSTRAINT IF EXISTS "payrolls_payroll_created_by_fkey";
ALTER TABLE "payrolls"
  ADD CONSTRAINT "payrolls_payroll_created_by_fkey"
  FOREIGN KEY ("payroll_created_by") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
