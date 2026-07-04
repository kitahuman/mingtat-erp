-- Fix certified_amount that was incorrectly overwritten by migration 20260704000001.
-- certified_amount is a user-entered field (what the client actually certified).
-- Migration 20260704000001 wrongly set it to amount_due_cumulative.
--
-- Recovery strategy:
--   - Where certified_amount was overwritten (i.e. it equals amount_due_cumulative),
--     restore it to current_due (the calculated Amount Due for this period),
--     which is what users typically enter as the certified amount.
--   - Records that were never touched (certified_amount != amount_due_cumulative)
--     are left unchanged.

UPDATE payment_applications
SET certified_amount = current_due
WHERE status != 'void'
  AND certified_amount = amount_due_cumulative
  AND amount_due_cumulative != current_due;
