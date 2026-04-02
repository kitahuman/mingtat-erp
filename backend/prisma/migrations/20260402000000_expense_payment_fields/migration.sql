-- AlterTable: add is_paid and payment_method to expenses
ALTER TABLE "expenses"
  ADD COLUMN IF NOT EXISTS "is_paid" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "payment_method" TEXT;

-- CreateTable: expense_items
CREATE TABLE IF NOT EXISTS "expense_items" (
    "id" SERIAL NOT NULL,
    "expense_id" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL DEFAULT 1,
    "unit_price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable: expense_attachments
CREATE TABLE IF NOT EXISTS "expense_attachments" (
    "id" SERIAL NOT NULL,
    "expense_id" INTEGER NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_size" INTEGER,
    "mime_type" TEXT,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_attachments_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "expense_items" ADD CONSTRAINT "expense_items_expense_id_fkey"
  FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_attachments" ADD CONSTRAINT "expense_attachments_expense_id_fkey"
  FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
