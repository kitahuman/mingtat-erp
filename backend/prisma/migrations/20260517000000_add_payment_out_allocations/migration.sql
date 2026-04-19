-- ══════════════════════════════════════════════════════════════
-- PaymentOutAllocation: many-to-many allocation table between
-- PaymentOut and Expense / Payroll / SubconPayroll.
--
-- This migration also backfills existing data:
--   1. Each PaymentOut with a direct expense_id / subcon_payroll_id
--      becomes a PaymentOutAllocation row using PaymentOut.amount.
--   2. Each PaymentOut with a direct payroll_id becomes an allocation;
--      to avoid double-counting against existing PayrollPayment rows
--      that already point at the same PaymentOut, we prefer the
--      PayrollPayment.payroll_payment_amount when present.
--   3. Any remaining PayrollPayment rows whose linked PaymentOut does
--      NOT have a direct payroll_id are also backfilled into allocations.
--
-- The legacy direct foreign keys (expense_id / payroll_id /
-- subcon_payroll_id) on payment_outs and the payroll_payments table
-- are kept intact for backward compatibility.
-- ══════════════════════════════════════════════════════════════

-- CreateTable
CREATE TABLE IF NOT EXISTS "payment_out_allocations" (
    "id" SERIAL NOT NULL,
    "payment_out_allocation_payment_out_id" INTEGER NOT NULL,
    "payment_out_allocation_expense_id" INTEGER,
    "payment_out_allocation_payroll_id" INTEGER,
    "payment_out_allocation_subcon_payroll_id" INTEGER,
    "payment_out_allocation_amount" DECIMAL(14,2) NOT NULL,
    "payment_out_allocation_remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_out_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "payment_out_allocations_payment_out_id_idx" ON "payment_out_allocations"("payment_out_allocation_payment_out_id");
CREATE INDEX IF NOT EXISTS "payment_out_allocations_expense_id_idx" ON "payment_out_allocations"("payment_out_allocation_expense_id");
CREATE INDEX IF NOT EXISTS "payment_out_allocations_payroll_id_idx" ON "payment_out_allocations"("payment_out_allocation_payroll_id");
CREATE INDEX IF NOT EXISTS "payment_out_allocations_subcon_payroll_id_idx" ON "payment_out_allocations"("payment_out_allocation_subcon_payroll_id");

-- AddForeignKey
ALTER TABLE "payment_out_allocations"
    ADD CONSTRAINT "payment_out_allocations_payment_out_fkey"
    FOREIGN KEY ("payment_out_allocation_payment_out_id")
    REFERENCES "payment_outs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payment_out_allocations"
    ADD CONSTRAINT "payment_out_allocations_expense_fkey"
    FOREIGN KEY ("payment_out_allocation_expense_id")
    REFERENCES "expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payment_out_allocations"
    ADD CONSTRAINT "payment_out_allocations_payroll_fkey"
    FOREIGN KEY ("payment_out_allocation_payroll_id")
    REFERENCES "payrolls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payment_out_allocations"
    ADD CONSTRAINT "payment_out_allocations_subcon_payroll_fkey"
    FOREIGN KEY ("payment_out_allocation_subcon_payroll_id")
    REFERENCES "subcon_payrolls"("subcon_payroll_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ══════════════════════════════════════════════════════════════
-- Data migration: backfill from existing PaymentOut / PayrollPayment
-- ══════════════════════════════════════════════════════════════

-- 1. Backfill from PaymentOut.expense_id (one allocation per PaymentOut)
INSERT INTO "payment_out_allocations" (
    "payment_out_allocation_payment_out_id",
    "payment_out_allocation_expense_id",
    "payment_out_allocation_amount",
    "payment_out_allocation_remarks",
    "created_at",
    "updated_at"
)
SELECT
    po."id",
    po."expense_id",
    po."amount",
    'Auto-migrated from legacy PaymentOut.expense_id',
    po."created_at",
    po."updated_at"
FROM "payment_outs" po
WHERE po."expense_id" IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM "payment_out_allocations" a
      WHERE a."payment_out_allocation_payment_out_id" = po."id"
        AND a."payment_out_allocation_expense_id" = po."expense_id"
  );

-- 2. Backfill from PaymentOut.subcon_payroll_id
INSERT INTO "payment_out_allocations" (
    "payment_out_allocation_payment_out_id",
    "payment_out_allocation_subcon_payroll_id",
    "payment_out_allocation_amount",
    "payment_out_allocation_remarks",
    "created_at",
    "updated_at"
)
SELECT
    po."id",
    po."subcon_payroll_id",
    po."amount",
    'Auto-migrated from legacy PaymentOut.subcon_payroll_id',
    po."created_at",
    po."updated_at"
FROM "payment_outs" po
WHERE po."subcon_payroll_id" IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM "payment_out_allocations" a
      WHERE a."payment_out_allocation_payment_out_id" = po."id"
        AND a."payment_out_allocation_subcon_payroll_id" = po."subcon_payroll_id"
  );

-- 3a. Backfill from PayrollPayment rows that have a linked PaymentOut.
--     We use the PayrollPayment.amount (more granular than PaymentOut.amount).
INSERT INTO "payment_out_allocations" (
    "payment_out_allocation_payment_out_id",
    "payment_out_allocation_payroll_id",
    "payment_out_allocation_amount",
    "payment_out_allocation_remarks",
    "created_at",
    "updated_at"
)
SELECT
    pp."payroll_payment_payment_out_id",
    pp."payroll_payment_payroll_id",
    pp."payroll_payment_amount",
    COALESCE('Auto-migrated from PayrollPayment #' || pp."id" ||
        CASE WHEN pp."payroll_payment_remarks" IS NOT NULL
             THEN ' - ' || pp."payroll_payment_remarks"
             ELSE '' END, NULL),
    pp."payroll_payment_created_at",
    pp."payroll_payment_updated_at"
FROM "payroll_payments" pp
WHERE pp."payroll_payment_payment_out_id" IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM "payment_out_allocations" a
      WHERE a."payment_out_allocation_payment_out_id" = pp."payroll_payment_payment_out_id"
        AND a."payment_out_allocation_payroll_id" = pp."payroll_payment_payroll_id"
  );

-- 3b. Backfill from PaymentOut.payroll_id where there is NO matching
--     PayrollPayment for that (payment_out, payroll) pair already inserted.
INSERT INTO "payment_out_allocations" (
    "payment_out_allocation_payment_out_id",
    "payment_out_allocation_payroll_id",
    "payment_out_allocation_amount",
    "payment_out_allocation_remarks",
    "created_at",
    "updated_at"
)
SELECT
    po."id",
    po."payroll_id",
    po."amount",
    'Auto-migrated from legacy PaymentOut.payroll_id',
    po."created_at",
    po."updated_at"
FROM "payment_outs" po
WHERE po."payroll_id" IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM "payment_out_allocations" a
      WHERE a."payment_out_allocation_payment_out_id" = po."id"
        AND a."payment_out_allocation_payroll_id" = po."payroll_id"
  );
