-- AlterTable: Add equipment_number to fleet_rate_cards
ALTER TABLE "fleet_rate_cards" ADD COLUMN IF NOT EXISTS "equipment_number" TEXT;

-- AlterTable: Add missing fields to subcon_rate_cards
ALTER TABLE "subcon_rate_cards" ADD COLUMN IF NOT EXISTS "equipment_number" TEXT;
ALTER TABLE "subcon_rate_cards" ADD COLUMN IF NOT EXISTS "day_rate" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "subcon_rate_cards" ADD COLUMN IF NOT EXISTS "day_unit" TEXT;
ALTER TABLE "subcon_rate_cards" ADD COLUMN IF NOT EXISTS "night_rate" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "subcon_rate_cards" ADD COLUMN IF NOT EXISTS "night_unit" TEXT;
ALTER TABLE "subcon_rate_cards" ADD COLUMN IF NOT EXISTS "mid_shift_rate" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "subcon_rate_cards" ADD COLUMN IF NOT EXISTS "mid_shift_unit" TEXT;
ALTER TABLE "subcon_rate_cards" ADD COLUMN IF NOT EXISTS "ot_unit" TEXT;

-- Migrate unit_price to day_rate if unit_price exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='subcon_rate_cards' AND column_name='unit_price') THEN
    UPDATE "subcon_rate_cards" SET "day_rate" = "unit_price" WHERE "day_rate" = 0 AND "unit_price" > 0;
    ALTER TABLE "subcon_rate_cards" DROP COLUMN IF EXISTS "unit_price";
  END IF;
END $$;

-- CreateTable: fleet_rate_card_ot_rates
CREATE TABLE IF NOT EXISTS "fleet_rate_card_ot_rates" (
    "id" SERIAL NOT NULL,
    "fleet_rate_card_id" INTEGER NOT NULL,
    "time_slot" TEXT NOT NULL,
    "rate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "unit" TEXT,
    CONSTRAINT "fleet_rate_card_ot_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable: subcon_rate_card_ot_rates
CREATE TABLE IF NOT EXISTS "subcon_rate_card_ot_rates" (
    "id" SERIAL NOT NULL,
    "subcon_rate_card_id" INTEGER NOT NULL,
    "time_slot" TEXT NOT NULL,
    "rate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "unit" TEXT,
    CONSTRAINT "subcon_rate_card_ot_rates_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey: fleet_rate_card_ot_rates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fleet_rate_card_ot_rates_fleet_rate_card_id_fkey'
  ) THEN
    ALTER TABLE "fleet_rate_card_ot_rates" ADD CONSTRAINT "fleet_rate_card_ot_rates_fleet_rate_card_id_fkey"
      FOREIGN KEY ("fleet_rate_card_id") REFERENCES "fleet_rate_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey: subcon_rate_card_ot_rates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'subcon_rate_card_ot_rates_subcon_rate_card_id_fkey'
  ) THEN
    ALTER TABLE "subcon_rate_card_ot_rates" ADD CONSTRAINT "subcon_rate_card_ot_rates_subcon_rate_card_id_fkey"
      FOREIGN KEY ("subcon_rate_card_id") REFERENCES "subcon_rate_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey: work_logs contract_id (in case previous migration didn't run)
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
