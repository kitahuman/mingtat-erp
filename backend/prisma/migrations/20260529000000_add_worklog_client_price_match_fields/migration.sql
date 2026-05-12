-- Add client RateCard matching fields to work logs
ALTER TABLE "work_logs"
ADD COLUMN "matched_client_rate_card_id" INTEGER,
ADD COLUMN "matched_client_rate" DECIMAL(12, 2),
ADD COLUMN "matched_client_unit" TEXT,
ADD COLUMN "matched_client_ot_rate" DECIMAL(12, 2),
ADD COLUMN "client_price_match_status" TEXT,
ADD COLUMN "client_price_match_note" TEXT;
