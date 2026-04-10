-- CreateTable: Add audit_logs table
CREATE TABLE "audit_logs" (
  "id" SERIAL NOT NULL,
  "audit_user_id" INTEGER NOT NULL,
  "audit_action" VARCHAR(50) NOT NULL,
  "audit_target_table" VARCHAR(100) NOT NULL,
  "audit_target_id" INTEGER NOT NULL,
  "audit_changes_before" JSONB,
  "audit_changes_after" JSONB,
  "audit_ip_address" VARCHAR(45),
  "audit_timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "audit_user_agent" TEXT,

  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_audit_user_id_idx" ON "audit_logs"("audit_user_id");

-- CreateIndex
CREATE INDEX "audit_logs_audit_timestamp_idx" ON "audit_logs"("audit_timestamp");

-- CreateIndex
CREATE INDEX "audit_logs_audit_target_table_audit_target_id_idx" ON "audit_logs"("audit_target_table", "audit_target_id");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_audit_user_id_fkey" FOREIGN KEY ("audit_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
