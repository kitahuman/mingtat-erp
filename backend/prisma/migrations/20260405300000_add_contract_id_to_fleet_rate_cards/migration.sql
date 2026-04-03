-- AddColumn: contract_id to fleet_rate_cards
ALTER TABLE "fleet_rate_cards" ADD COLUMN IF NOT EXISTS "contract_id" INTEGER;

-- AddForeignKey
ALTER TABLE "fleet_rate_cards" ADD CONSTRAINT "fleet_rate_cards_contract_id_fkey"
  FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
