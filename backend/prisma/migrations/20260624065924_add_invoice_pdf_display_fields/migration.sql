-- Add 4 new PDF display fields to Invoice table
ALTER TABLE "invoices" ADD COLUMN "invoice_show_client_contact" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "invoices" ADD COLUMN "invoice_show_client_signature" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "invoices" ADD COLUMN "invoice_show_company_signature" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "invoices" ADD COLUMN "invoice_show_company_stamp" BOOLEAN NOT NULL DEFAULT false;
