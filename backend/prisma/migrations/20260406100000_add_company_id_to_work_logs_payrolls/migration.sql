-- Add company_id to work_logs
ALTER TABLE "work_logs" ADD COLUMN IF NOT EXISTS "company_id" INTEGER;

-- Add company_id to payrolls
ALTER TABLE "payrolls" ADD COLUMN IF NOT EXISTS "company_id" INTEGER;

-- Add company_id and company_name to payroll_work_logs
ALTER TABLE "payroll_work_logs" ADD COLUMN IF NOT EXISTS "company_id" INTEGER;
ALTER TABLE "payroll_work_logs" ADD COLUMN IF NOT EXISTS "company_name" TEXT;

-- Data migration: populate company_id from company_profile_id via company_profiles table
UPDATE "work_logs" wl
SET "company_id" = cp."company_id"
FROM "company_profiles" cp
WHERE wl."company_profile_id" = cp."id"
  AND wl."company_id" IS NULL
  AND cp."company_id" IS NOT NULL;

UPDATE "payrolls" p
SET "company_id" = cp."company_id"
FROM "company_profiles" cp
WHERE p."company_profile_id" = cp."id"
  AND p."company_id" IS NULL
  AND cp."company_id" IS NOT NULL;

UPDATE "payroll_work_logs" pwl
SET "company_id" = cp."company_id",
    "company_name" = c."name"
FROM "company_profiles" cp
LEFT JOIN "companies" c ON c."id" = cp."company_id"
WHERE pwl."company_profile_id" = cp."id"
  AND pwl."company_id" IS NULL
  AND cp."company_id" IS NOT NULL;

-- Add foreign key constraints
ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
