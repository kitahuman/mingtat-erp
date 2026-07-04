-- Add amount_due_cumulative column to payment_applications
ALTER TABLE "payment_applications"
  ADD COLUMN "amount_due_cumulative" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- Backfill amount_due_cumulative for all non-void IPAs using the full Payment Summary formula:
--   amount_due_cumulative = totalWorkDone + advanceSubtotal - retentionAmount - otherDeductions
--   where advanceSubtotal = advancePaymentAmount + advanceRelease
--         advanceRelease  = -(totalWorkDone × advance_release_rate)   [0 when no advance]
--         retentionAmount = totalWorkDone × retention_rate
UPDATE payment_applications pa
SET amount_due_cumulative = ROUND(
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

-- Recalculate current_due:
-- For pa_no = 1: currentDue = amount_due_cumulative - advance_payment_amount
-- For pa_no > 1: currentDue = amount_due_cumulative - previous IPA's amount_due_cumulative
WITH ordered AS (
  SELECT
    pa.id,
    pa.contract_id,
    pa.pa_no,
    pa.amount_due_cumulative,
    LAG(pa.amount_due_cumulative) OVER (PARTITION BY pa.contract_id ORDER BY pa.pa_no) AS prev_amount_due,
    COALESCE(c.advance_payment_amount, 0) AS advance_payment_amount
  FROM payment_applications pa
  JOIN contracts c ON pa.contract_id = c.id
  WHERE pa.status != 'void'
)
UPDATE payment_applications pa
SET current_due = ROUND(
  o.amount_due_cumulative - COALESCE(
    o.prev_amount_due,
    o.advance_payment_amount  -- pa_no=1: previously certified = advance already paid
  ),
  2
)
FROM ordered o
WHERE pa.id = o.id;
