-- AlterTable: Add equipment_number to rate_cards
ALTER TABLE "rate_cards" ADD COLUMN IF NOT EXISTS "equipment_number" TEXT;
