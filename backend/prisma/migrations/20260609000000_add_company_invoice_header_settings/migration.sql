-- Add company-level invoice PDF header settings.
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "invoice_address" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "invoice_phone" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "invoice_fax" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "invoice_company_name_en" TEXT;
