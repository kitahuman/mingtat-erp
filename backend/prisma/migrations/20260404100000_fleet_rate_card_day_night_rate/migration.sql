-- AlterTable: Add day_night and rate fields to fleet_rate_cards
ALTER TABLE "fleet_rate_cards" ADD COLUMN "day_night" TEXT;
ALTER TABLE "fleet_rate_cards" ADD COLUMN "rate" DECIMAL(12,2) NOT NULL DEFAULT 0;
