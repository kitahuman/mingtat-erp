-- AlterTable: Add shift (day/night) column to verification_wa_orders
ALTER TABLE "verification_wa_orders" ADD COLUMN "wa_order_shift" VARCHAR(10) NOT NULL DEFAULT 'day';

-- CreateIndex
CREATE INDEX "verification_wa_orders_wa_order_shift_idx" ON "verification_wa_orders"("wa_order_shift");
