-- ============================================================
-- Migration: cleanup_terminated_employee_accounts
-- Purpose  : Remove user accounts that were auto-created for
--            terminated (inactive) employees.
--
-- Background
-- ----------
-- A bug in employee-portal loginByPhone() allowed the auto-create
-- logic to build a User account for ANY employee matching a phone
-- number, without checking whether the employee was still active.
-- This migration identifies and removes those orphaned accounts.
--
-- Safety approach
-- ---------------
-- 1. We only delete users whose role is 'worker' AND who are
--    linked (via employee_id) to an employee with status = 'inactive'.
-- 2. We do NOT touch admin / manager accounts.
-- 3. A SELECT preview is shown first (as a comment) so the DBA can
--    review before the DELETE runs.
-- ============================================================

-- ── Step 1: Preview – list user accounts linked to inactive employees ──
-- Run this SELECT manually to review what will be deleted before
-- executing Step 2.
--
-- SELECT
--     u.id          AS user_id,
--     u.username,
--     u.phone,
--     u.role,
--     u.is_active,
--     e.id          AS employee_id,
--     e.name_zh     AS employee_name,
--     e.status      AS employee_status,
--     e.termination_date
-- FROM users u
-- JOIN employees e ON e.id = u.employee_id
-- WHERE e.status = 'inactive'
--   AND u.role = 'worker';

-- ── Step 2: Delete user accounts linked to terminated employees ──
-- Only deletes worker-role accounts whose linked employee is inactive.
-- Admin / manager accounts are intentionally excluded.
DELETE FROM "users"
WHERE id IN (
    SELECT u.id
    FROM "users" u
    JOIN "employees" e ON e.id = u.employee_id
    WHERE e.status = 'inactive'
      AND u.role = 'worker'
);
