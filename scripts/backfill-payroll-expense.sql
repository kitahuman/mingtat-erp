-- Backfill script to fix historical payroll expense data
-- This script fixes two issues:
-- 1. Updates expense.total_amount from grossIncome to net_amount (淨薪金)
-- 2. Links PaymentOut records to expenses and creates PaymentOutAllocation records

-- ============================================================================
-- PART 1: DRY RUN - Show what will be changed (no modifications)
-- ============================================================================

-- Check 1: Expenses with incorrect amount (using grossIncome instead of net_amount)
SELECT 
  'EXPENSE_AMOUNT_FIX' as fix_type,
  e.id as expense_id,
  e.source_ref_id as payroll_id,
  e.total_amount as current_amount,
  p.net_amount as correct_amount,
  (p.net_amount - e.total_amount) as difference,
  e.item,
  e.date,
  COUNT(*) OVER () as total_count
FROM "Expense" e
INNER JOIN "Payroll" p ON e.source_ref_id = p.id
WHERE e.source = 'PAYROLL'
  AND e.deleted_at IS NULL
  AND p.deleted_at IS NULL
  AND e.total_amount != p.net_amount
ORDER BY e.id DESC;

-- Check 2: PaymentOut records linked to payroll but missing expense_id
SELECT 
  'PAYMENT_OUT_MISSING_EXPENSE_ID' as fix_type,
  po.id as payment_out_id,
  po.payroll_id,
  po.expense_id,
  po.amount,
  COUNT(*) OVER () as total_count
FROM "PaymentOut" po
WHERE po.payroll_id IS NOT NULL
  AND po.deleted_at IS NULL
  AND po.expense_id IS NULL
ORDER BY po.id DESC;

-- Check 3: PaymentOut records missing PaymentOutAllocation
SELECT 
  'PAYMENT_OUT_MISSING_ALLOCATION' as fix_type,
  po.id as payment_out_id,
  po.payroll_id,
  po.amount,
  COUNT(poa.id) as allocation_count,
  COUNT(*) OVER () as total_count
FROM "PaymentOut" po
LEFT JOIN "PaymentOutAllocation" poa 
  ON poa.payment_out_allocation_payment_out_id = po.id
WHERE po.payroll_id IS NOT NULL
  AND po.deleted_at IS NULL
GROUP BY po.id, po.payroll_id, po.amount
HAVING COUNT(poa.id) = 0
ORDER BY po.id DESC;

-- Summary
SELECT 
  'SUMMARY' as report_type,
  (SELECT COUNT(*) FROM "Expense" e 
   INNER JOIN "Payroll" p ON e.source_ref_id = p.id
   WHERE e.source = 'PAYROLL' AND e.deleted_at IS NULL AND p.deleted_at IS NULL
     AND e.total_amount != p.net_amount) as expenses_to_fix,
  (SELECT COUNT(*) FROM "PaymentOut" po
   WHERE po.payroll_id IS NOT NULL AND po.deleted_at IS NULL AND po.expense_id IS NULL) as payment_outs_missing_expense_id,
  (SELECT COUNT(*) FROM "PaymentOut" po
   LEFT JOIN "PaymentOutAllocation" poa ON poa.payment_out_allocation_payment_out_id = po.id
   WHERE po.payroll_id IS NOT NULL AND po.deleted_at IS NULL
   GROUP BY po.id HAVING COUNT(poa.id) = 0) as payment_outs_missing_allocation;

-- ============================================================================
-- PART 2: ACTUAL FIXES (Execute only after confirming dry run results)
-- ============================================================================

-- FIX 1: Update expense.total_amount to use net_amount
BEGIN TRANSACTION;

UPDATE "Expense" e
SET total_amount = p.net_amount,
    updated_at = NOW()
FROM "Payroll" p
WHERE e.source = 'PAYROLL'
  AND e.source_ref_id = p.id
  AND e.deleted_at IS NULL
  AND p.deleted_at IS NULL
  AND e.total_amount != p.net_amount;

-- FIX 2: Set expense_id on PaymentOut records (for single-expense payrolls)
UPDATE "PaymentOut" po
SET expense_id = e.id,
    updated_at = NOW()
FROM "Payroll" p
INNER JOIN "Expense" e ON e.source = 'PAYROLL' AND e.source_ref_id = p.id
WHERE po.payroll_id = p.id
  AND po.deleted_at IS NULL
  AND e.deleted_at IS NULL
  AND p.deleted_at IS NULL
  AND po.expense_id IS NULL
  -- Only set if there's exactly one expense for this payroll
  AND (SELECT COUNT(*) FROM "Expense" e2 
       WHERE e2.source = 'PAYROLL' AND e2.source_ref_id = p.id AND e2.deleted_at IS NULL) = 1;

-- FIX 3: Create PaymentOutAllocation records for PaymentOut without allocations
INSERT INTO "PaymentOutAllocation" (
  payment_out_allocation_payment_out_id,
  payment_out_allocation_expense_id,
  payment_out_allocation_amount,
  created_at,
  updated_at
)
SELECT 
  po.id,
  e.id,
  po.amount,
  NOW(),
  NOW()
FROM "PaymentOut" po
INNER JOIN "Payroll" p ON po.payroll_id = p.id
INNER JOIN "Expense" e ON e.source = 'PAYROLL' AND e.source_ref_id = p.id
WHERE po.deleted_at IS NULL
  AND e.deleted_at IS NULL
  AND p.deleted_at IS NULL
  -- Only add allocation if it doesn't already exist
  AND NOT EXISTS (
    SELECT 1 FROM "PaymentOutAllocation" poa
    WHERE poa.payment_out_allocation_payment_out_id = po.id
      AND poa.payment_out_allocation_expense_id = e.id
  )
ON CONFLICT DO NOTHING;

-- FIX 4: Recalculate expense payment status based on allocations
-- Update paid_amount for each expense
UPDATE "Expense" e
SET paid_amount = COALESCE((
  SELECT SUM(poa.payment_out_allocation_amount)
  FROM "PaymentOutAllocation" poa
  WHERE poa.payment_out_allocation_expense_id = e.id
), 0),
    updated_at = NOW()
WHERE e.source = 'PAYROLL'
  AND e.deleted_at IS NULL;

-- Update payment_status based on paid_amount vs total_amount
UPDATE "Expense" e
SET payment_status = CASE
  WHEN e.paid_amount >= e.total_amount THEN 'paid'
  WHEN e.paid_amount > 0 THEN 'partial'
  ELSE 'unpaid'
END,
    updated_at = NOW()
WHERE e.source = 'PAYROLL'
  AND e.deleted_at IS NULL;

COMMIT;

-- ============================================================================
-- VERIFICATION: Show the results after fixes
-- ============================================================================

SELECT 
  'VERIFICATION' as report_type,
  COUNT(*) as total_payroll_expenses,
  COUNT(CASE WHEN payment_status = 'paid' THEN 1 END) as paid_count,
  COUNT(CASE WHEN payment_status = 'partial' THEN 1 END) as partial_count,
  COUNT(CASE WHEN payment_status = 'unpaid' THEN 1 END) as unpaid_count,
  SUM(total_amount) as total_expense_amount,
  SUM(paid_amount) as total_paid_amount
FROM "Expense"
WHERE source = 'PAYROLL'
  AND deleted_at IS NULL;

-- Show sample of fixed expenses
SELECT 
  'SAMPLE_FIXED_EXPENSES' as report_type,
  e.id,
  e.source_ref_id as payroll_id,
  e.total_amount,
  e.paid_amount,
  e.payment_status,
  e.item
FROM "Expense" e
WHERE e.source = 'PAYROLL'
  AND e.deleted_at IS NULL
ORDER BY e.id DESC
LIMIT 20;
