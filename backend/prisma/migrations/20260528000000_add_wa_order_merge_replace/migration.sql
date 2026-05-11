-- Add AI update intent and backend merge/replace metadata to WhatsApp orders.
ALTER TABLE "verification_wa_orders"
  ADD COLUMN "wa_order_is_update" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "wa_order_update_mode" VARCHAR(30),
  ADD COLUMN "wa_order_merge_strategy" VARCHAR(30),
  ADD COLUMN "wa_order_parent_id" INTEGER,
  ADD COLUMN "wa_order_replaces_order_id" INTEGER,
  ADD COLUMN "wa_order_ai_update_reason" TEXT,
  ADD COLUMN "wa_order_merge_reason" TEXT,
  ADD COLUMN "wa_order_match_stats" JSONB;

CREATE INDEX "verification_wa_orders_wa_order_parent_id_idx"
  ON "verification_wa_orders"("wa_order_parent_id");

CREATE INDEX "verification_wa_orders_wa_order_replaces_order_id_idx"
  ON "verification_wa_orders"("wa_order_replaces_order_id");

CREATE INDEX "verification_wa_orders_wa_order_merge_strategy_idx"
  ON "verification_wa_orders"("wa_order_merge_strategy");

ALTER TABLE "verification_wa_orders"
  ADD CONSTRAINT "verification_wa_orders_wa_order_parent_id_fkey"
  FOREIGN KEY ("wa_order_parent_id")
  REFERENCES "verification_wa_orders"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "verification_wa_orders"
  ADD CONSTRAINT "verification_wa_orders_wa_order_replaces_order_id_fkey"
  FOREIGN KEY ("wa_order_replaces_order_id")
  REFERENCES "verification_wa_orders"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Persist each deterministic merge/replace decision for audit and future learning.
CREATE TABLE "verification_wa_order_merge_logs" (
  "id" SERIAL NOT NULL,
  "merge_log_new_order_id" INTEGER NOT NULL,
  "merge_log_base_order_id" INTEGER,
  "merge_log_source_msg_id" INTEGER NOT NULL,
  "merge_log_decision" VARCHAR(30) NOT NULL,
  "merge_log_ai_update_mode" VARCHAR(30),
  "merge_log_old_item_count" INTEGER NOT NULL DEFAULT 0,
  "merge_log_new_item_count" INTEGER NOT NULL DEFAULT 0,
  "merge_log_merged_item_count" INTEGER NOT NULL DEFAULT 0,
  "merge_log_matched_item_count" INTEGER NOT NULL DEFAULT 0,
  "merge_log_decision_payload" JSONB,
  "merge_log_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "verification_wa_order_merge_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "verification_wa_order_merge_logs_new_order_id_idx"
  ON "verification_wa_order_merge_logs"("merge_log_new_order_id");

CREATE INDEX "verification_wa_order_merge_logs_base_order_id_idx"
  ON "verification_wa_order_merge_logs"("merge_log_base_order_id");

CREATE INDEX "verification_wa_order_merge_logs_source_msg_id_idx"
  ON "verification_wa_order_merge_logs"("merge_log_source_msg_id");

CREATE INDEX "verification_wa_order_merge_logs_decision_idx"
  ON "verification_wa_order_merge_logs"("merge_log_decision");

ALTER TABLE "verification_wa_order_merge_logs"
  ADD CONSTRAINT "verification_wa_order_merge_logs_new_order_id_fkey"
  FOREIGN KEY ("merge_log_new_order_id")
  REFERENCES "verification_wa_orders"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "verification_wa_order_merge_logs"
  ADD CONSTRAINT "verification_wa_order_merge_logs_base_order_id_fkey"
  FOREIGN KEY ("merge_log_base_order_id")
  REFERENCES "verification_wa_orders"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "verification_wa_order_merge_logs"
  ADD CONSTRAINT "verification_wa_order_merge_logs_source_msg_id_fkey"
  FOREIGN KEY ("merge_log_source_msg_id")
  REFERENCES "verification_wa_messages"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
