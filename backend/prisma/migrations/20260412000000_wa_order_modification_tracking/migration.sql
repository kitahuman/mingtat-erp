-- AlterTable: verification_wa_order_items — add modification tracking columns
ALTER TABLE "verification_wa_order_items" ADD COLUMN IF NOT EXISTS "wa_item_mod_status" VARCHAR(30);
ALTER TABLE "verification_wa_order_items" ADD COLUMN IF NOT EXISTS "wa_item_mod_prev_data" JSONB;

-- CreateTable: verification_wa_mod_logs — WhatsApp Order modification history
CREATE TABLE IF NOT EXISTS "verification_wa_mod_logs" (
    "id" SERIAL NOT NULL,
    "mod_order_id" INTEGER NOT NULL,
    "mod_item_id" INTEGER,
    "mod_msg_id" INTEGER NOT NULL,
    "mod_type" VARCHAR(30) NOT NULL,
    "mod_description" TEXT NOT NULL,
    "mod_prev_value" JSONB,
    "mod_new_value" JSONB,
    "mod_ai_confidence" DECIMAL(5,2),
    "mod_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_wa_mod_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "verification_wa_mod_logs_mod_order_id_idx" ON "verification_wa_mod_logs"("mod_order_id");
CREATE INDEX IF NOT EXISTS "verification_wa_mod_logs_mod_item_id_idx" ON "verification_wa_mod_logs"("mod_item_id");
CREATE INDEX IF NOT EXISTS "verification_wa_mod_logs_mod_msg_id_idx" ON "verification_wa_mod_logs"("mod_msg_id");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "verification_wa_mod_logs" ADD CONSTRAINT "verification_wa_mod_logs_mod_order_id_fkey" FOREIGN KEY ("mod_order_id") REFERENCES "verification_wa_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "verification_wa_mod_logs" ADD CONSTRAINT "verification_wa_mod_logs_mod_item_id_fkey" FOREIGN KEY ("mod_item_id") REFERENCES "verification_wa_order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "verification_wa_mod_logs" ADD CONSTRAINT "verification_wa_mod_logs_mod_msg_id_fkey" FOREIGN KEY ("mod_msg_id") REFERENCES "verification_wa_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
