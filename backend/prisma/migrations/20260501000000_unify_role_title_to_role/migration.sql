-- ══════════════════════════════════════════════════════════════
-- 統一員工職位欄位：將 role_title 值遷移至 role
-- 規則：當 role_title 有值且 role 為空或為預設值 'worker' 時，
--       將 role_title 的值寫入 role
-- 注意：role_title 欄位暫時保留不刪除，避免破壞性變更
-- ══════════════════════════════════════════════════════════════

-- 將 role_title 有值但 role 為空或 'worker' 的員工，把 role_title 值寫入 role
UPDATE "employees"
SET "role" = "role_title"
WHERE "role_title" IS NOT NULL
  AND "role_title" != ''
  AND ("role" IS NULL OR "role" = '' OR "role" = 'worker');

-- 為遷移後的記錄添加註解（可選：將已遷移的 role_title 標記）
-- 不清空 role_title，保留原始資料作為備份
