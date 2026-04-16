-- DropIndex (remove old non-unique index)
DROP INDEX IF EXISTS "verification_wa_messages_wa_msg_remote_id_idx";

-- CreateIndex (partial unique: only enforce uniqueness on non-null remote IDs)
CREATE UNIQUE INDEX "verification_wa_messages_wa_msg_remote_id_key"
  ON "verification_wa_messages"("wa_msg_remote_id")
  WHERE "wa_msg_remote_id" IS NOT NULL;
