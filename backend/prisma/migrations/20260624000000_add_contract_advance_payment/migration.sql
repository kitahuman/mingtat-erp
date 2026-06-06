-- Add advance payment management fields to contracts
ALTER TABLE "contracts"
ADD COLUMN "advance_payment_rate" DECIMAL(5,4),
ADD COLUMN "advance_payment_amount" DECIMAL(12,2),
ADD COLUMN "advance_payment_invoice_id" INTEGER;

CREATE INDEX "contracts_advance_payment_invoice_id_idx"
ON "contracts"("advance_payment_invoice_id");

ALTER TABLE "contracts"
ADD CONSTRAINT "contracts_advance_payment_invoice_id_fkey"
FOREIGN KEY ("advance_payment_invoice_id") REFERENCES "invoices"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
