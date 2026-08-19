-- AlterTable: record whether the other deduction (其他扣款) of a payment-in
-- allocation is applied before or after the retention (扣留金) calculation.
-- Values: 'before_retention' | 'after_retention'; NULL = legacy rows (treated as before_retention).
ALTER TABLE "payment_in_allocations"
  ADD COLUMN IF NOT EXISTS "other_deduction_timing" VARCHAR(20);
