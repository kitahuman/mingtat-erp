-- AddColumn: source field to expenses table
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "source" TEXT DEFAULT 'erp';
