-- AlterTable: Add order_type column to verification_wa_order_items
ALTER TABLE "verification_wa_order_items" ADD COLUMN IF NOT EXISTS "wa_item_order_type" VARCHAR(30);
