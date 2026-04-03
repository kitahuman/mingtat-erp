-- AddColumn: client_contract_no to rate_cards
DO $$ BEGIN
  ALTER TABLE "rate_cards" ADD COLUMN "client_contract_no" TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- AddColumn: client_contract_no to fleet_rate_cards
DO $$ BEGIN
  ALTER TABLE "fleet_rate_cards" ADD COLUMN "client_contract_no" TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- AddColumn: client_contract_no to subcon_rate_cards
DO $$ BEGIN
  ALTER TABLE "subcon_rate_cards" ADD COLUMN "client_contract_no" TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- AddColumn: client_contract_no to work_logs
DO $$ BEGIN
  ALTER TABLE "work_logs" ADD COLUMN "client_contract_no" TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- AddColumn: client_contract_no to payroll_work_logs
DO $$ BEGIN
  ALTER TABLE "payroll_work_logs" ADD COLUMN "client_contract_no" TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
