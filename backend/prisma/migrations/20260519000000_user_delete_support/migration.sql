-- ══════════════════════════════════════════════════════════════
-- User delete / edit support migration
--
-- Goals:
--   1. Allow hard-deleting a User without losing readable history.
--      Tables that previously required a creator/operator user reference
--      are made nullable, and a name-snapshot column is added so the
--      original user's display name is preserved after the FK is nulled.
--   2. Convert "ON DELETE NO ACTION" foreign keys on creator columns
--      (daily_reports, acceptance_reports, verification_confirmations)
--      to "ON DELETE SET NULL" so the User row can be removed safely.
--   3. Add "publisher_name" snapshot to work_logs for the same reason
--      (publisher_id was already nullable with NO ACTION FK).
--   4. Backfill the new *_name columns from the current user records so
--      existing history rows still display the correct creator name.
--
-- This migration deliberately does NOT touch:
--   - audit_logs (uses Cascade — audit history is removed with the user
--     by design)
--   - web_push_subscriptions (uses Cascade — subscriptions are
--     per-device and meaningless without the user)
--   - companies/vehicles/machinery/partners/contracts/projects/
--     quotations/rate_cards/expenses/invoices/work_logs/employees/
--     daily_reports.deleted_by columns (already nullable with
--     NO ACTION; users.service handles them by clearing first)
--   - employee_attendances.user_id / attendance_operator_user_id /
--     mid_shift_approved_by and employee_leaves.user_id / approved_by
--     which are plain INT columns without DB-level FKs (handled by
--     application code).
-- ══════════════════════════════════════════════════════════════

-- ── 1. work_logs.publisher_name ────────────────────────────────
ALTER TABLE "work_logs"
  ADD COLUMN IF NOT EXISTS "publisher_name" VARCHAR(200);

-- Backfill snapshot from current publisher
UPDATE "work_logs" wl
   SET "publisher_name" = COALESCE(NULLIF(u."display_name", ''), u."username")
  FROM "users" u
 WHERE wl."publisher_id" = u."id"
   AND wl."publisher_name" IS NULL;

-- ── 2. daily_reports.daily_report_created_by_name + nullable FK ─
ALTER TABLE "daily_reports"
  ADD COLUMN IF NOT EXISTS "daily_report_created_by_name" VARCHAR(200);

UPDATE "daily_reports" dr
   SET "daily_report_created_by_name" = COALESCE(NULLIF(u."display_name", ''), u."username")
  FROM "users" u
 WHERE dr."daily_report_created_by" = u."id"
   AND dr."daily_report_created_by_name" IS NULL;

-- Make created_by nullable so the user can be deleted
ALTER TABLE "daily_reports"
  ALTER COLUMN "daily_report_created_by" DROP NOT NULL;

-- Replace existing FK with ON DELETE SET NULL
ALTER TABLE "daily_reports"
  DROP CONSTRAINT IF EXISTS "daily_reports_daily_report_created_by_fkey";
ALTER TABLE "daily_reports"
  ADD CONSTRAINT "daily_reports_daily_report_created_by_fkey"
  FOREIGN KEY ("daily_report_created_by") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ── 3. acceptance_reports.acceptance_report_created_by_name + nullable FK
ALTER TABLE "acceptance_reports"
  ADD COLUMN IF NOT EXISTS "acceptance_report_created_by_name" VARCHAR(200);

UPDATE "acceptance_reports" ar
   SET "acceptance_report_created_by_name" = COALESCE(NULLIF(u."display_name", ''), u."username")
  FROM "users" u
 WHERE ar."acceptance_report_created_by" = u."id"
   AND ar."acceptance_report_created_by_name" IS NULL;

ALTER TABLE "acceptance_reports"
  ALTER COLUMN "acceptance_report_created_by" DROP NOT NULL;

ALTER TABLE "acceptance_reports"
  DROP CONSTRAINT IF EXISTS "acceptance_reports_acceptance_report_created_by_fkey";
ALTER TABLE "acceptance_reports"
  ADD CONSTRAINT "acceptance_reports_acceptance_report_created_by_fkey"
  FOREIGN KEY ("acceptance_report_created_by") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ── 4. verification_confirmations.confirmed_by_name + nullable FK
ALTER TABLE "verification_confirmations"
  ADD COLUMN IF NOT EXISTS "confirmed_by_name" VARCHAR(200);

UPDATE "verification_confirmations" vc
   SET "confirmed_by_name" = COALESCE(NULLIF(u."display_name", ''), u."username")
  FROM "users" u
 WHERE vc."confirmed_by" = u."id"
   AND vc."confirmed_by_name" IS NULL;

ALTER TABLE "verification_confirmations"
  ALTER COLUMN "confirmed_by" DROP NOT NULL;

ALTER TABLE "verification_confirmations"
  DROP CONSTRAINT IF EXISTS "verification_confirmations_confirmed_by_fkey";
ALTER TABLE "verification_confirmations"
  ADD CONSTRAINT "verification_confirmations_confirmed_by_fkey"
  FOREIGN KEY ("confirmed_by") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ── 5. work_logs.publisher_id FK -> ON DELETE SET NULL ─────────
-- (publisher_id is already nullable; tighten its FK behaviour)
ALTER TABLE "work_logs"
  DROP CONSTRAINT IF EXISTS "work_logs_publisher_id_fkey";
ALTER TABLE "work_logs"
  ADD CONSTRAINT "work_logs_publisher_id_fkey"
  FOREIGN KEY ("publisher_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
