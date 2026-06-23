-- AlterTable: add name preference columns to partners
ALTER TABLE "partners"
  ADD COLUMN "invoice_name_preference" TEXT NOT NULL DEFAULT 'zh',
  ADD COLUMN "quotation_name_preference" TEXT NOT NULL DEFAULT 'zh';

-- AlterTable: add display_client_name to invoices
ALTER TABLE "invoices"
  ADD COLUMN "display_client_name" TEXT;

-- AlterTable: add display_client_name to quotations
ALTER TABLE "quotations"
  ADD COLUMN "display_client_name" TEXT;
