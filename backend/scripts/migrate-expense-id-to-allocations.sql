-- ============================================================================
-- Migrate legacy PaymentOut.expense_id direct FK links to
-- PaymentOutAllocation rows (many-to-many mechanism).
--
-- 用法（部署時手動執行）：
--   psql "$DATABASE_URL" -f scripts/migrate-expense-id-to-allocations.sql
--
-- 此腳本為冪等（idempotent）：重複執行不會產生重複的 allocation 記錄。
-- expense_id 欄位保留不刪除，僅作為歷史參考；代碼已不再寫入新值。
-- ============================================================================

BEGIN;

-- 1) 為所有 expense_id IS NOT NULL 且尚未有對應 allocation 的 payment_outs
--    建立 allocation 記錄（金額 = 該筆付款的全額）。
INSERT INTO "payment_out_allocations" (
  "payment_out_allocation_payment_out_id",
  "payment_out_allocation_expense_id",
  "payment_out_allocation_amount",
  "created_at",
  "updated_at"
)
SELECT
  po."id",
  po."expense_id",
  po."amount",
  NOW(),
  NOW()
FROM "payment_outs" po
WHERE po."expense_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "payment_out_allocations" a
    WHERE a."payment_out_allocation_payment_out_id" = po."id"
      AND a."payment_out_allocation_expense_id" = po."expense_id"
  );

-- 2) 驗證：遷移後不應再有任何缺少 allocation 的 legacy 連結。
DO $$
DECLARE
  remaining INTEGER;
BEGIN
  SELECT COUNT(*) INTO remaining
  FROM "payment_outs" po
  WHERE po."expense_id" IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM "payment_out_allocations" a
      WHERE a."payment_out_allocation_payment_out_id" = po."id"
        AND a."payment_out_allocation_expense_id" = po."expense_id"
    );
  IF remaining > 0 THEN
    RAISE EXCEPTION 'Migration incomplete: % payment_outs still missing allocations', remaining;
  END IF;
  RAISE NOTICE 'Migration OK: all legacy expense_id links now have allocations.';
END $$;

-- 3) 重算受影響 expenses 的付款狀態（paid / partially_paid / unpaid）。
--    只計算 allocation（payment_out 狀態為 paid）的總額，與後端
--    computePaidTotal('expense', id) 的新邏輯一致。
WITH paid_totals AS (
  SELECT
    a."payment_out_allocation_expense_id" AS expense_id,
    SUM(a."payment_out_allocation_amount") AS paid_total
  FROM "payment_out_allocations" a
  JOIN "payment_outs" po
    ON po."id" = a."payment_out_allocation_payment_out_id"
  WHERE a."payment_out_allocation_expense_id" IS NOT NULL
    AND po."payment_out_status" = 'paid'
  GROUP BY a."payment_out_allocation_expense_id"
),
affected AS (
  SELECT DISTINCT po."expense_id" AS expense_id
  FROM "payment_outs" po
  WHERE po."expense_id" IS NOT NULL
)
UPDATE "expenses" e
SET
  "payment_status" = CASE
    WHEN COALESCE(pt.paid_total, 0) <= 0 THEN 'unpaid'
    WHEN COALESCE(pt.paid_total, 0) + 0.0001 < COALESCE(e."total_amount", 0) THEN 'partially_paid'
    ELSE 'paid'
  END,
  "is_paid" = (COALESCE(pt.paid_total, 0) > 0 AND COALESCE(pt.paid_total, 0) + 0.0001 >= COALESCE(e."total_amount", 0)),
  "updated_at" = NOW()
FROM affected af
LEFT JOIN paid_totals pt ON pt.expense_id = af.expense_id
WHERE e."id" = af.expense_id;

COMMIT;
