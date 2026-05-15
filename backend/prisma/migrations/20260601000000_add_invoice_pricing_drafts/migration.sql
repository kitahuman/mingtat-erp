CREATE TABLE IF NOT EXISTS "invoice_pricing_drafts" (
    "id" SERIAL NOT NULL,
    "invoice_id" INTEGER NOT NULL,
    "pivot_config" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "row_prices" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "draft_items" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_pricing_drafts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "invoice_pricing_drafts_invoice_id_key" ON "invoice_pricing_drafts"("invoice_id");

ALTER TABLE "invoice_pricing_drafts"
ADD CONSTRAINT "invoice_pricing_drafts_invoice_id_fkey"
FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
