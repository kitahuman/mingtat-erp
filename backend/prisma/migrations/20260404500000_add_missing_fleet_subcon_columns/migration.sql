-- Add missing columns to fleet_rate_cards
ALTER TABLE "fleet_rate_cards" ADD COLUMN IF NOT EXISTS "company_id" INTEGER;
ALTER TABLE "fleet_rate_cards" ADD COLUMN IF NOT EXISTS "service_type" TEXT;
ALTER TABLE "fleet_rate_cards" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "fleet_rate_cards" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "fleet_rate_cards" ADD COLUMN IF NOT EXISTS "effective_date" DATE;
ALTER TABLE "fleet_rate_cards" ADD COLUMN IF NOT EXISTS "expiry_date" DATE;

-- Add FK for fleet_rate_cards.company_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fleet_rate_cards_company_id_fkey'
    AND table_name = 'fleet_rate_cards'
  ) THEN
    ALTER TABLE "fleet_rate_cards" ADD CONSTRAINT "fleet_rate_cards_company_id_fkey"
      FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Add missing columns to subcon_rate_cards
ALTER TABLE "subcon_rate_cards" ADD COLUMN IF NOT EXISTS "company_id" INTEGER;
ALTER TABLE "subcon_rate_cards" ADD COLUMN IF NOT EXISTS "service_type" TEXT;
ALTER TABLE "subcon_rate_cards" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "subcon_rate_cards" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "subcon_rate_cards" ADD COLUMN IF NOT EXISTS "machine_type" TEXT;
ALTER TABLE "subcon_rate_cards" ADD COLUMN IF NOT EXISTS "effective_date" DATE;
ALTER TABLE "subcon_rate_cards" ADD COLUMN IF NOT EXISTS "expiry_date" DATE;

-- Add FK for subcon_rate_cards.company_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'subcon_rate_cards_company_id_fkey'
    AND table_name = 'subcon_rate_cards'
  ) THEN
    ALTER TABLE "subcon_rate_cards" ADD CONSTRAINT "subcon_rate_cards_company_id_fkey"
      FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
