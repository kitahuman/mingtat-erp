-- Add company-level invoice branding and payment settings
ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "company_logo_url" TEXT,
  ADD COLUMN IF NOT EXISTS "invoice_color_theme" VARCHAR(20) DEFAULT '#1a365d',
  ADD COLUMN IF NOT EXISTS "invoice_bank_info" JSONB,
  ADD COLUMN IF NOT EXISTS "invoice_default_payment_terms" TEXT;

-- Add invoice-level PDF display and language options
ALTER TABLE "invoices"
  ADD COLUMN IF NOT EXISTS "invoice_custom_payment_terms" TEXT,
  ADD COLUMN IF NOT EXISTS "invoice_language" VARCHAR(10) DEFAULT 'zh',
  ADD COLUMN IF NOT EXISTS "invoice_show_bank" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "invoice_show_client_address" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "invoice_show_client_phone" BOOLEAN NOT NULL DEFAULT true;
