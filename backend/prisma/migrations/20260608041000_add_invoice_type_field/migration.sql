-- AlterTable
ALTER TABLE "invoices" ADD COLUMN "invoice_type" TEXT NOT NULL DEFAULT 'invoice';

-- CreateIndex
CREATE INDEX "invoices_invoice_type_idx" ON "invoices"("invoice_type");
