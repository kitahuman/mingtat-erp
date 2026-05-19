-- CreateTable
CREATE TABLE "work_log_locks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "work_log_id" INTEGER NOT NULL,
    "locked_by_user_id" INTEGER NOT NULL,
    "locked_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_log_locks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "work_log_locks_work_log_id_key" ON "work_log_locks"("work_log_id");

-- CreateIndex
CREATE INDEX "work_log_locks_locked_by_user_id_idx" ON "work_log_locks"("locked_by_user_id");

-- CreateIndex
CREATE INDEX "work_log_locks_locked_at_idx" ON "work_log_locks"("locked_at");

-- AddForeignKey
ALTER TABLE "work_log_locks" ADD CONSTRAINT "work_log_locks_work_log_id_fkey" FOREIGN KEY ("work_log_id") REFERENCES "work_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_log_locks" ADD CONSTRAINT "work_log_locks_locked_by_user_id_fkey" FOREIGN KEY ("locked_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
