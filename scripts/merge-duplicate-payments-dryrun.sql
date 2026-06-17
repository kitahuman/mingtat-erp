-- ============================================================
-- DRY RUN: Merge duplicate PaymentIn for DCL (上海商業銀行)
-- No data is modified. Read-only analysis only.
-- ============================================================

\echo ''
\echo '===== SECTION 1: DUPLICATE GROUPS SUMMARY ====='
\echo 'Columns: date | reference_no | bank_account | payment_count | merged_amount | keep_id | all_ids | all_amounts | total_allocations | total_deductions'
\echo ''

SELECT
  grp.date,
  grp.reference_no,
  ba.bank_name || ' (' || ba.account_no || ')' AS bank_account,
  grp.group_count                               AS payment_count,
  grp.group_total                               AS merged_amount,
  MIN(pi.id)                                    AS keep_id,
  STRING_AGG(pi.id::text, ',' ORDER BY pi.id)   AS all_ids,
  STRING_AGG(pi.amount::text, ',' ORDER BY pi.id) AS all_amounts,
  (
    SELECT COUNT(*)
    FROM payment_in_allocations pia
    WHERE pia.payment_in_allocation_payment_in_id = ANY(ARRAY_AGG(pi.id))
  ) AS total_allocations,
  (
    SELECT COUNT(*)
    FROM payment_in_deductions pid
    WHERE pid.payment_in_deduction_payment_in_id = ANY(ARRAY_AGG(pi.id))
  ) AS total_deductions
FROM (
  SELECT
    pi2.date,
    pi2.reference_no,
    pi2.bank_account_id,
    COUNT(pi2.id)   AS group_count,
    SUM(pi2.amount) AS group_total
  FROM payment_ins pi2
  JOIN bank_accounts ba2 ON ba2.id = pi2.bank_account_id
  WHERE (ba2.bank_name ILIKE '%上海商業%' OR ba2.account_no = '34482079962')
    AND pi2.reference_no IS NOT NULL
    AND pi2.reference_no != ''
  GROUP BY pi2.date, pi2.reference_no, pi2.bank_account_id
  HAVING COUNT(pi2.id) > 1
) grp
JOIN payment_ins pi ON pi.date = grp.date
  AND pi.reference_no = grp.reference_no
  AND pi.bank_account_id = grp.bank_account_id
JOIN bank_accounts ba ON ba.id = grp.bank_account_id
GROUP BY grp.date, grp.reference_no, grp.bank_account_id, ba.bank_name, ba.account_no,
         grp.group_count, grp.group_total
ORDER BY grp.date DESC, grp.reference_no;

\echo ''
\echo '===== SECTION 2: RECORDS TO DELETE (non-minimum IDs per group) ====='
\echo 'Columns: delete_id | date | reference_no | amount | keep_id | allocations | deductions'
\echo ''

SELECT
  pi.id          AS delete_id,
  pi.date,
  pi.reference_no,
  pi.amount,
  grp.keep_id,
  (SELECT COUNT(*) FROM payment_in_allocations pia WHERE pia.payment_in_allocation_payment_in_id = pi.id) AS allocations,
  (SELECT COUNT(*) FROM payment_in_deductions pid WHERE pid.payment_in_deduction_payment_in_id = pi.id) AS deductions
FROM payment_ins pi
JOIN (
  SELECT
    pi2.date,
    pi2.reference_no,
    pi2.bank_account_id,
    MIN(pi2.id) AS keep_id
  FROM payment_ins pi2
  JOIN bank_accounts ba2 ON ba2.id = pi2.bank_account_id
  WHERE (ba2.bank_name ILIKE '%上海商業%' OR ba2.account_no = '34482079962')
    AND pi2.reference_no IS NOT NULL
    AND pi2.reference_no != ''
  GROUP BY pi2.date, pi2.reference_no, pi2.bank_account_id
  HAVING COUNT(pi2.id) > 1
) grp ON grp.date = pi.date
  AND grp.reference_no = pi.reference_no
  AND grp.bank_account_id = pi.bank_account_id
WHERE pi.id != grp.keep_id
ORDER BY pi.date DESC, pi.reference_no, pi.id;

\echo ''
\echo '===== SECTION 3: TOTALS ====='
\echo ''

SELECT
  COUNT(DISTINCT (pi.date::text || '|' || pi.reference_no || '|' || pi.bank_account_id::text))
                                                               AS groups_to_merge,
  COUNT(pi.id) FILTER (WHERE pi.id != grp.keep_id)            AS records_to_delete,
  COUNT(pi.id) FILTER (WHERE pi.id = grp.keep_id)             AS records_to_keep,
  SUM(alloc.cnt) FILTER (WHERE pi.id != grp.keep_id)          AS allocations_to_reassign,
  SUM(deduct.cnt) FILTER (WHERE pi.id != grp.keep_id)         AS deductions_to_reassign
FROM payment_ins pi
JOIN (
  SELECT
    pi2.date,
    pi2.reference_no,
    pi2.bank_account_id,
    MIN(pi2.id) AS keep_id
  FROM payment_ins pi2
  JOIN bank_accounts ba2 ON ba2.id = pi2.bank_account_id
  WHERE (ba2.bank_name ILIKE '%上海商業%' OR ba2.account_no = '34482079962')
    AND pi2.reference_no IS NOT NULL
    AND pi2.reference_no != ''
  GROUP BY pi2.date, pi2.reference_no, pi2.bank_account_id
  HAVING COUNT(pi2.id) > 1
) grp ON grp.date = pi.date
  AND grp.reference_no = pi.reference_no
  AND grp.bank_account_id = pi.bank_account_id
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS cnt FROM payment_in_allocations pia WHERE pia.payment_in_allocation_payment_in_id = pi.id
) alloc ON true
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS cnt FROM payment_in_deductions pid WHERE pid.payment_in_deduction_payment_in_id = pi.id
) deduct ON true;
