-- AlterTable: Add contract_id to work_logs
ALTER TABLE "work_logs" ADD COLUMN IF NOT EXISTS "contract_id" INTEGER;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'work_logs_contract_id_fkey'
    AND table_name = 'work_logs'
  ) THEN
    ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_contract_id_fkey"
      FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
