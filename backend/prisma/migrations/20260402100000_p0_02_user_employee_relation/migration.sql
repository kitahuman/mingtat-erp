-- P0-02: User.employee_id 加 Relation
-- 1. 清理重複的 employee_id（保留最新的，其他設為 NULL）
UPDATE users u1
SET employee_id = NULL
WHERE employee_id IS NOT NULL
  AND id <> (
    SELECT id FROM users u2
    WHERE u2.employee_id = u1.employee_id
    ORDER BY u2.id DESC
    LIMIT 1
  );

-- 2. 加上 UNIQUE 約束
CREATE UNIQUE INDEX IF NOT EXISTS "users_employee_id_key" ON "users"("employee_id");

-- 3. 加上外鍵約束
ALTER TABLE "users"
  ADD CONSTRAINT "users_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "employees"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
