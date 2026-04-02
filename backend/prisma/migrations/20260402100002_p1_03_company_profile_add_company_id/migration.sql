-- P1-03: CompanyProfile 加 company_id
-- 1. 新增 company_id 欄位
ALTER TABLE "company_profiles" ADD COLUMN IF NOT EXISTS "company_id" INTEGER;

-- 2. 加上外鍵約束
ALTER TABLE "company_profiles"
  ADD CONSTRAINT "company_profiles_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. 數據回填：用 internal_prefix 和 code 做匹配
UPDATE company_profiles cp
SET company_id = c.id
FROM companies c
WHERE c.internal_prefix = cp.code;

-- 4. 建立索引
CREATE INDEX IF NOT EXISTS "company_profiles_company_id_idx" ON "company_profiles"("company_id");
