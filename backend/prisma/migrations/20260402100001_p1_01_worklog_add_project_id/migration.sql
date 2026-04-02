-- P1-01: WorkLog 加 project_id
-- 1. 新增 project_id 欄位
ALTER TABLE "work_logs" ADD COLUMN IF NOT EXISTS "project_id" INTEGER;

-- 2. 加上外鍵約束
ALTER TABLE "work_logs"
  ADD CONSTRAINT "work_logs_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. 數據回填：從 quotation 取得 project_id
UPDATE work_logs wl
SET project_id = q.project_id
FROM quotations q
WHERE wl.quotation_id = q.id
  AND q.project_id IS NOT NULL
  AND wl.project_id IS NULL;

-- 4. 建立索引加速查詢
CREATE INDEX IF NOT EXISTS "work_logs_project_id_idx" ON "work_logs"("project_id");
