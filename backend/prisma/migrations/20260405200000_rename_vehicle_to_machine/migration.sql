-- Rename vehicle_type → machine_type and vehicle_tonnage → tonnage
-- across rate_cards, fleet_rate_cards, and subcon_rate_cards tables.
-- Uses DO blocks with exception handling for safety (column may already be renamed).

-- rate_cards: vehicle_type → machine_type
DO $$ BEGIN
  ALTER TABLE "rate_cards" RENAME COLUMN "vehicle_type" TO "machine_type";
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- rate_cards: vehicle_tonnage → tonnage
DO $$ BEGIN
  ALTER TABLE "rate_cards" RENAME COLUMN "vehicle_tonnage" TO "tonnage";
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- fleet_rate_cards: vehicle_type → machine_type
DO $$ BEGIN
  ALTER TABLE "fleet_rate_cards" RENAME COLUMN "vehicle_type" TO "machine_type";
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- fleet_rate_cards: vehicle_tonnage → tonnage
DO $$ BEGIN
  ALTER TABLE "fleet_rate_cards" RENAME COLUMN "vehicle_tonnage" TO "tonnage";
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- subcon_rate_cards: vehicle_type → machine_type
DO $$ BEGIN
  ALTER TABLE "subcon_rate_cards" RENAME COLUMN "vehicle_type" TO "machine_type";
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- subcon_rate_cards: vehicle_tonnage → tonnage
DO $$ BEGIN
  ALTER TABLE "subcon_rate_cards" RENAME COLUMN "vehicle_tonnage" TO "tonnage";
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- Migrate field_options: rename category 'vehicle_type' to 'machine_type'
UPDATE "field_options" SET "category" = 'machine_type' WHERE "category" = 'vehicle_type';
