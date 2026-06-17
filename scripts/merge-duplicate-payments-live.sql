-- ============================================================
-- LIVE MERGE: Duplicate PaymentIn for DCL (上海商業銀行)
-- Runs inside a single transaction. Rolls back on any error.
-- ============================================================

BEGIN;

-- Step 1: Create a temp table of groups (date, ref, bank_account_id, keep_id, merged_amount)
CREATE TEMP TABLE merge_groups AS
SELECT
  pi2.date,
  pi2.reference_no,
  pi2.bank_account_id,
  MIN(pi2.id)   AS keep_id,
  SUM(pi2.amount) AS merged_amount,
  COUNT(pi2.id)   AS group_count
FROM payment_ins pi2
JOIN bank_accounts ba2 ON ba2.id = pi2.bank_account_id
WHERE (ba2.bank_name ILIKE '%上海商業%' OR ba2.account_no = '34482079962')
  AND pi2.reference_no IS NOT NULL
  AND pi2.reference_no != ''
GROUP BY pi2.date, pi2.reference_no, pi2.bank_account_id
HAVING COUNT(pi2.id) > 1;

\echo 'Groups identified:'
SELECT COUNT(*) AS groups_to_merge FROM merge_groups;

-- Step 2: Create a temp table of records to delete (non-keep IDs)
CREATE TEMP TABLE records_to_delete AS
SELECT pi.id AS delete_id, mg.keep_id
FROM payment_ins pi
JOIN merge_groups mg ON mg.date = pi.date
  AND mg.reference_no = pi.reference_no
  AND mg.bank_account_id = pi.bank_account_id
WHERE pi.id != mg.keep_id;

\echo 'Records to delete:'
SELECT COUNT(*) AS records_to_delete FROM records_to_delete;

-- Step 3: Reassign all allocations from delete_ids to keep_id
UPDATE payment_in_allocations pia
SET payment_in_allocation_payment_in_id = rtd.keep_id
FROM records_to_delete rtd
WHERE pia.payment_in_allocation_payment_in_id = rtd.delete_id;

\echo 'Allocations reassigned:'
SELECT COUNT(*) AS allocations_reassigned
FROM payment_in_allocations pia
JOIN merge_groups mg ON pia.payment_in_allocation_payment_in_id = mg.keep_id;

-- Step 4: Reassign all deductions from delete_ids to keep_id
UPDATE payment_in_deductions pid
SET payment_in_deduction_payment_in_id = rtd.keep_id
FROM records_to_delete rtd
WHERE pid.payment_in_deduction_payment_in_id = rtd.delete_id;

-- Step 5: Update keep_id amount to merged_amount
UPDATE payment_ins pi
SET amount = mg.merged_amount,
    updated_at = NOW()
FROM merge_groups mg
WHERE pi.id = mg.keep_id;

\echo 'Keep records amount updated:'
SELECT COUNT(*) AS updated_keep_records FROM merge_groups;

-- Step 6: Hard delete the duplicate records
DELETE FROM payment_ins
WHERE id IN (SELECT delete_id FROM records_to_delete);

\echo 'Records deleted:'
SELECT COUNT(*) AS deleted FROM records_to_delete;

-- Step 7: Final verification
\echo ''
\echo '===== FINAL VERIFICATION ====='
\echo 'Remaining duplicates (should be 0):'
SELECT COUNT(*) AS remaining_duplicates
FROM (
  SELECT pi.date, pi.reference_no, pi.bank_account_id, COUNT(*) AS cnt
  FROM payment_ins pi
  JOIN bank_accounts ba ON ba.id = pi.bank_account_id
  WHERE (ba.bank_name ILIKE '%上海商業%' OR ba.account_no = '34482079962')
    AND pi.reference_no IS NOT NULL AND pi.reference_no != ''
  GROUP BY pi.date, pi.reference_no, pi.bank_account_id
  HAVING COUNT(*) > 1
) sub;

\echo 'Summary of merged records (sample - first 10):'
SELECT pi.id, pi.date, pi.reference_no, pi.amount,
  (SELECT COUNT(*) FROM payment_in_allocations pia WHERE pia.payment_in_allocation_payment_in_id = pi.id) AS allocations
FROM payment_ins pi
JOIN merge_groups mg ON pi.id = mg.keep_id
ORDER BY pi.date DESC
LIMIT 10;

COMMIT;

\echo ''
\echo '===== MERGE COMPLETE ====='
