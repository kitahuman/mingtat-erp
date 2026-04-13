-- AlterTable: Add product name, unit and goods quantity to verification_wa_order_items
ALTER TABLE "verification_wa_order_items" ADD COLUMN "wa_item_product_name" TEXT;
ALTER TABLE "verification_wa_order_items" ADD COLUMN "wa_item_product_unit" TEXT;
ALTER TABLE "verification_wa_order_items" ADD COLUMN "wa_item_goods_quantity" DECIMAL(10,2);
