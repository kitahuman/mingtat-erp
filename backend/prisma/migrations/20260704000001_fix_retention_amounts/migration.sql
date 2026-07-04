-- ─────────────────────────────────────────────────────────────────────────────
-- Fix IPA calculated fields to match the full Payment Summary formula:
--   certified_amount = totalWorkDone + advanceSubtotal - retentionAmount - otherDeductions
--   where advanceSubtotal = advancePaymentAmount + advanceRelease
--         advanceRelease  = -(totalWorkDone × advance_release_rate)   [0 when no advance]
--         retentionAmount = totalWorkDone × retention_rate
-- ─────────────────────────────────────────────────────────────────────────────

-- Step 1: Recalculate retention_amount, after_retention, and certified_amount
-- for all non-void IPAs using the contract's current rates.
UPDATE payment_applications pa
SET
  retention_amount = ROUND(
    pa.cumulative_work_done * c.retention_rate,
    2
  ),
  after_retention = ROUND(
    pa.gross_amount - (pa.cumulative_work_done * c.retention_rate),
    2
  ),
  -- certified_amount = cumulative Amount Due (includes advance section)
  certified_amount = ROUND(
    pa.cumulative_work_done
    + CASE
        WHEN COALESCE(c.advance_payment_amount, 0) > 0
          THEN COALESCE(c.advance_payment_amount, 0)
               - (pa.cumulative_work_done * COALESCE(c.advance_release_rate, c.advance_payment_rate, 0))
        ELSE 0
      END
    - (pa.cumulative_work_done * c.retention_rate)
    - pa.other_deductions,
    2
  )
FROM contracts c
WHERE pa.contract_id = c.id
  AND pa.status != 'void';

-- Step 2: Recalculate current_due sequentially per contract.
-- For pa_no = 1: previouslyCertified = advance_payment_amount (already paid at contract start)
-- For pa_no > 1: previouslyCertified = previous IPA's certified_amount
WITH ordered AS (
  SELECT
    pa.id,
    pa.contract_id,
    pa.pa_no,
    pa.certified_amount,
    LAG(pa.certified_amount) OVER (PARTITION BY pa.contract_id ORDER BY pa.pa_no) AS prev_certified,
    COALESCE(c.advance_payment_amount, 0) AS advance_payment_amount
  FROM payment_applications pa
  JOIN contracts c ON pa.contract_id = c.id
  WHERE pa.status != 'void'
)
UPDATE payment_applications pa
SET current_due = ROUND(
  o.certified_amount - COALESCE(
    o.prev_certified,
    o.advance_payment_amount  -- pa_no=1: previously certified = advance already paid
  ),
  2
)
FROM ordered o
WHERE pa.id = o.id;
