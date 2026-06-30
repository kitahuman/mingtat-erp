-- Add receipt_options JSONB column to payment_ins for storing receipt PDF display preferences
ALTER TABLE "payment_ins" ADD COLUMN "receipt_options" JSONB;

-- Add receipt_no VARCHAR unique column for auto-generated receipt number (format: RCP-YYYY-NNNN)
ALTER TABLE "payment_ins" ADD COLUMN "receipt_no" VARCHAR(20) UNIQUE;
