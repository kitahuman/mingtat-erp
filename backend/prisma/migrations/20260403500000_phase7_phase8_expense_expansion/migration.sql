-- Phase 7: Expense Expansion + Phase 8: Payroll Auto-Generate Expenses

-- 1. ExpenseCategory: Add 'type' column (DIRECT / OVERHEAD)
ALTER TABLE "expense_categories" ADD COLUMN IF NOT EXISTS "type" VARCHAR(20);

-- 2. Expense: Add 'source_ref_id' column
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "source_ref_id" INTEGER;

-- 3. Migrate existing source values: 'erp' -> 'MANUAL', 'employee_portal' -> 'MANUAL'
UPDATE "expenses" SET "source" = 'MANUAL' WHERE "source" IS NULL OR "source" = 'erp' OR "source" = 'employee_portal';

-- 4. Set default category types for existing parent categories
UPDATE "expense_categories" SET "type" = 'DIRECT' WHERE "parent_id" IS NULL AND "name" IN ('工程支出');
UPDATE "expense_categories" SET "type" = 'OVERHEAD' WHERE "parent_id" IS NULL AND "name" IN ('出糧支出', '車輛支出', '機械支出', '行政支出', '其他支出');

-- 5. Propagate type to children from parents
UPDATE "expense_categories" c
SET "type" = p."type"
FROM "expense_categories" p
WHERE c."parent_id" = p."id" AND c."type" IS NULL AND p."type" IS NOT NULL;
